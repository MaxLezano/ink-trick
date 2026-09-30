package com.lezma.InkTrick

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import me.zhanghai.android.libarchive.Archive
import me.zhanghai.android.libarchive.ArchiveEntry
import me.zhanghai.android.libarchive.ArchiveException
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream

/**
 * Native helpers for comic archives (CBR/CBZ) and PDF metadata.
 *
 * Page extraction writes a `manifest.json` into the destination folder once every page has been
 * extracted. The manifest is the completion marker: a folder without it is treated as a partial
 * (interrupted) extraction and is rebuilt from scratch.
 */
class ComicArchiveModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newFixedThreadPool(3)

    // Deduplicates concurrent extractions of the same book (e.g. double tap on a card).
    private val extractionLocks = ConcurrentHashMap<String, Any>()

    override fun getName(): String = "ComicArchiveModule"

    private val validImageExtensions = setOf("jpg", "jpeg", "png", "webp", "bmp", "gif")

    // ─── Helpers ────────────────────────────────────────────────────────────

    private fun isImageEntry(name: String): Boolean {
        val lower = name.lowercase(Locale.ROOT)
        if (lower.contains("__macosx") || lower.contains(".ds_store") || lower.contains("thumbs.db")) {
            return false
        }
        val base = lower.substringAfterLast('/').substringAfterLast('\\')
        if (base.startsWith("._")) return false
        return base.substringAfterLast('.', "") in validImageExtensions
    }

    private fun cleanUri(uriString: String): String =
        if (uriString.startsWith("file://")) Uri.decode(uriString.removePrefix("file://")) else uriString

    private fun openReadFd(uriString: String): ParcelFileDescriptor {
        val clean = cleanUri(uriString)
        return if (clean.startsWith("content://")) {
            reactApplicationContext.contentResolver.openFileDescriptor(Uri.parse(clean), "r")
                ?: throw IllegalStateException("Cannot open $uriString")
        } else {
            ParcelFileDescriptor.open(File(clean), ParcelFileDescriptor.MODE_READ_ONLY)
        }
    }

    private fun openInputStream(uriString: String): InputStream? {
        val clean = cleanUri(uriString)
        return if (clean.startsWith("content://")) {
            reactApplicationContext.contentResolver.openInputStream(Uri.parse(clean))
        } else {
            File(clean).inputStream()
        }
    }

    private fun fileSizeOf(uriString: String): Long = try {
        openReadFd(uriString).use { it.statSize }
    } catch (_: Exception) {
        -1L
    }

    /** Opens a libarchive reader directly on the file descriptor (no temp copy of the archive). */
    private inline fun <T> withArchive(uriString: String, block: (Long) -> T): T {
        val pfd = openReadFd(uriString)
        val archive = Archive.readNew()
        try {
            Archive.readSupportFilterAll(archive)
            Archive.readSupportFormatAll(archive)
            Archive.readOpenFd(archive, pfd.fd, 64 * 1024L)
            return block(archive)
        } finally {
            try { Archive.readClose(archive) } catch (_: Exception) {}
            try { Archive.readFree(archive) } catch (_: Exception) {}
            try { pfd.close() } catch (_: Exception) {}
        }
    }

    /** Iterates archive headers; returns null from [onEntry] to continue, or a value to stop. */
    private inline fun <T> forEachEntry(archive: Long, onEntry: (entry: Long, path: String) -> T?): T? {
        while (true) {
            val entry = try {
                Archive.readNextHeader(archive)
            } catch (e: ArchiveException) {
                if (e.code == Archive.ERRNO_EOF) return null
                throw e
            }
            if (entry == 0L) return null
            val path = ArchiveEntry.pathnameUtf8(entry) ?: ArchiveEntry.pathname(entry)?.let { String(it) } ?: ""
            val result = onEntry(entry, path)
            if (result != null) return result
        }
    }

    private fun writeEntryToFile(archive: Long, outFile: File) {
        ParcelFileDescriptor.open(
            outFile,
            ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_TRUNCATE
        ).use { Archive.readDataIntoFd(archive, it.fd) }
    }

    private fun sendProgress(bookId: String, current: Int, percentage: Int) {
        if (bookId.isEmpty()) return
        try {
            val map = Arguments.createMap().apply {
                putString("bookId", bookId)
                putInt("current", current)
                putInt("total", 0)
                putInt("percentage", percentage.coerceIn(0, 100))
            }
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("onPreloadProgress", map)
        } catch (_: Exception) {}
    }

    private fun imageSize(file: File): Pair<Int, Int> {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, opts)
        return Pair(opts.outWidth.coerceAtLeast(0), opts.outHeight.coerceAtLeast(0))
    }

    private fun pagesToJs(dir: File, pages: JSONArray): WritableArray {
        val result = Arguments.createArray()
        for (i in 0 until pages.length()) {
            val p = pages.getJSONObject(i)
            val map: WritableMap = Arguments.createMap()
            map.putString("uri", "file://" + File(dir, p.getString("name")).absolutePath)
            map.putInt("width", p.optInt("w", 0))
            map.putInt("height", p.optInt("h", 0))
            result.pushMap(map)
        }
        return result
    }

    private fun readManifest(dir: File): JSONArray? {
        val manifest = File(dir, MANIFEST)
        if (!manifest.exists()) return null
        return try {
            val json = JSONObject(manifest.readText())
            if (json.optInt("version") != MANIFEST_VERSION) return null
            val pages = json.getJSONArray("pages")
            if (pages.length() == 0) null else pages
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Sorts raw extracted files by their original archive path (natural order), renames them to
     * `page_NNNN.ext`, measures them and writes the manifest atomically.
     */
    private fun finalizeExtraction(dir: File, raw: List<Pair<String, File>>): JSONArray {
        val sorted = raw.sortedWith { a, b -> naturalCompare(a.first, b.first) }
        val pages = JSONArray()
        sorted.forEachIndexed { index, (_, file) ->
            val ext = file.name.substringAfterLast('.', "jpg")
            val finalFile = File(dir, String.format(Locale.US, "page_%04d.%s", index + 1, ext))
            if (!file.renameTo(finalFile)) {
                file.copyTo(finalFile, overwrite = true)
                file.delete()
            }
            val (w, h) = imageSize(finalFile)
            pages.put(JSONObject().put("name", finalFile.name).put("w", w).put("h", h))
        }
        val tmp = File(dir, "$MANIFEST.tmp")
        tmp.writeText(JSONObject().put("version", MANIFEST_VERSION).put("pages", pages).toString())
        tmp.renameTo(File(dir, MANIFEST))
        return pages
    }

    private fun resetDir(dir: File) {
        if (dir.exists()) dir.deleteRecursively()
        dir.mkdirs()
    }

    private fun extractWithLibarchive(archiveUri: String, dir: File, bookId: String): List<Pair<String, File>> {
        val totalBytes = fileSizeOf(archiveUri).coerceAtLeast(1L)
        val raw = mutableListOf<Pair<String, File>>()
        var bytesSeen = 0L
        withArchive(archiveUri) { archive ->
            forEachEntry<Unit>(archive) { entry, path ->
                if (isImageEntry(path)) {
                    val ext = path.substringAfterLast('.', "jpg").lowercase(Locale.ROOT)
                    val out = File(dir, String.format(Locale.US, "raw_%05d.%s", raw.size, ext))
                    writeEntryToFile(archive, out)
                    if (out.length() > 0) {
                        raw.add(Pair(path, out))
                        bytesSeen += ArchiveEntry.size(entry).coerceAtLeast(out.length())
                        sendProgress(bookId, raw.size, ((bytesSeen * 100) / totalBytes).toInt().coerceAtMost(99))
                    } else {
                        out.delete()
                    }
                }
                null
            }
        }
        return raw
    }

    private fun extractWithZip(archiveUri: String, dir: File, bookId: String): List<Pair<String, File>> {
        val raw = mutableListOf<Pair<String, File>>()
        val stream = openInputStream(archiveUri) ?: return raw
        ZipInputStream(stream).use { zis ->
            var entry: ZipEntry? = zis.nextEntry
            while (entry != null) {
                if (!entry.isDirectory && isImageEntry(entry.name)) {
                    val ext = entry.name.substringAfterLast('.', "jpg").lowercase(Locale.ROOT)
                    val out = File(dir, String.format(Locale.US, "raw_%05d.%s", raw.size, ext))
                    FileOutputStream(out).use { zis.copyTo(it) }
                    if (out.length() > 0) {
                        raw.add(Pair(entry.name, out))
                        sendProgress(bookId, raw.size, 0)
                    }
                }
                entry = zis.nextEntry
            }
        }
        return raw
    }

    // ─── Comic pages ────────────────────────────────────────────────────────

    /** Returns cached pages ([{uri,width,height}]) if a complete extraction exists, otherwise null. */
    @ReactMethod
    fun getCachedPages(destDir: String, promise: Promise) {
        executor.execute {
            try {
                val dir = File(cleanUri(destDir))
                val pages = readManifest(dir)
                promise.resolve(if (pages != null) pagesToJs(dir, pages) else null)
            } catch (e: Exception) {
                promise.resolve(null)
            }
        }
    }

    /**
     * Extracts every image of the archive into [destDir] in natural reading order and returns
     * [{uri,width,height}]. Reuses a complete previous extraction when available.
     */
    @ReactMethod
    fun extractAllImages(archiveUri: String, destDir: String, bookId: String, promise: Promise) {
        executor.execute {
            val lock = extractionLocks.getOrPut(destDir) { Any() }
            synchronized(lock) {
                try {
                    val dir = File(cleanUri(destDir))
                    readManifest(dir)?.let {
                        promise.resolve(pagesToJs(dir, it))
                        return@execute
                    }

                    resetDir(dir)
                    var raw = try {
                        extractWithLibarchive(archiveUri, dir, bookId)
                    } catch (e: Exception) {
                        emptyList()
                    }
                    if (raw.isEmpty()) {
                        resetDir(dir)
                        raw = extractWithZip(archiveUri, dir, bookId)
                    }
                    if (raw.isEmpty()) {
                        promise.reject("EXTRACTION_ERROR", "No images found in archive")
                        return@execute
                    }
                    val pages = finalizeExtraction(dir, raw)
                    sendProgress(bookId, pages.length(), 100)
                    promise.resolve(pagesToJs(dir, pages))
                } catch (e: Exception) {
                    promise.reject("EXTRACTION_ERROR", e.message, e)
                } finally {
                    extractionLocks.remove(destDir)
                }
            }
        }
    }

    // ─── Covers ─────────────────────────────────────────────────────────────

    /** Decodes [bytes] (or [file]) scaled to at most [maxWidth] and stores it as a JPEG thumbnail. */
    private fun saveThumbnail(original: Bitmap, dest: File, maxWidth: Int) {
        // Covers whose page has wide blank margins (e.g. a landscape credits page) are cropped first.
        val box = contentBox(original)
        val source = if (box[0] > 0.0 || box[1] > 0.0 || box[2] < 1.0 || box[3] < 1.0) {
            val x = (box[0] * original.width).toInt()
            val y = (box[1] * original.height).toInt()
            val cw = ((box[2] - box[0]) * original.width).toInt().coerceAtLeast(1)
            val ch = ((box[3] - box[1]) * original.height).toInt().coerceAtLeast(1)
            Bitmap.createBitmap(original, x, y, cw.coerceAtMost(original.width - x), ch.coerceAtMost(original.height - y)).also {
                if (it !== original) original.recycle()
            }
        } else original
        val scaled = if (source.width > maxWidth) {
            val h = (source.height.toLong() * maxWidth / source.width).toInt().coerceAtLeast(1)
            Bitmap.createScaledBitmap(source, maxWidth, h, true)
        } else source
        dest.parentFile?.mkdirs()
        val tmp = File(dest.parentFile, dest.name + ".tmp")
        FileOutputStream(tmp).use { scaled.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        if (dest.exists()) dest.delete()
        tmp.renameTo(dest)
        if (scaled !== source) scaled.recycle()
        source.recycle()
    }

    private fun decodeSampled(bytes: ByteArray, maxWidth: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxWidth) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
    }

    private fun readEntryBytes(archive: Long, entry: Long): ByteArray {
        val out = ByteArrayOutputStream(ArchiveEntry.size(entry).coerceIn(0, 64L * 1024 * 1024).toInt())
        val buffer = java.nio.ByteBuffer.allocateDirect(256 * 1024)
        val chunk = ByteArray(256 * 1024)
        while (true) {
            buffer.clear()
            Archive.readData(archive, buffer)
            buffer.flip()
            val n = buffer.remaining()
            if (n <= 0) break
            buffer.get(chunk, 0, n)
            out.write(chunk, 0, n)
        }
        return out.toByteArray()
    }

    /**
     * Writes a small cover thumbnail of the archive's [pageNumber]-th page (1-based, natural order)
     * into [destPath]. Two passes: headers only (to find the page in reading order), then decode.
     */
    @ReactMethod
    fun extractCover(archiveUri: String, destPath: String, pageNumber: Int, maxWidth: Int, promise: Promise) {
        executor.execute {
            try {
                val dest = File(cleanUri(destPath))
                val names = mutableListOf<String>()
                try {
                    withArchive(archiveUri) { archive ->
                        forEachEntry<Unit>(archive) { _, path ->
                            if (isImageEntry(path)) names.add(path)
                            null
                        }
                    }
                } catch (_: Exception) {}

                var bytes: ByteArray? = null
                if (names.isNotEmpty()) {
                    val target = names.sortedWith { a, b -> naturalCompare(a, b) }[(pageNumber - 1).coerceIn(0, names.size - 1)]
                    bytes = withArchive(archiveUri) { archive ->
                        forEachEntry(archive) { entry, path -> if (path == target) readEntryBytes(archive, entry) else null }
                    }
                }
                if (bytes == null) {
                    // Zip fallback for archives libarchive cannot read.
                    val zipNames = mutableListOf<String>()
                    openInputStream(archiveUri)?.let { s ->
                        ZipInputStream(s).use { zis ->
                            var e = zis.nextEntry
                            while (e != null) {
                                if (!e.isDirectory && isImageEntry(e.name)) zipNames.add(e.name)
                                e = zis.nextEntry
                            }
                        }
                    }
                    if (zipNames.isNotEmpty()) {
                        val target = zipNames.sortedWith { a, b -> naturalCompare(a, b) }[(pageNumber - 1).coerceIn(0, zipNames.size - 1)]
                        openInputStream(archiveUri)?.let { s ->
                            ZipInputStream(s).use { zis ->
                                var e = zis.nextEntry
                                while (e != null && bytes == null) {
                                    if (e.name == target) bytes = zis.readBytes()
                                    e = zis.nextEntry
                                }
                            }
                        }
                    }
                }

                val bitmap = bytes?.let { decodeSampled(it, maxWidth) }
                if (bitmap == null) {
                    promise.reject("EXTRACTION_ERROR", "No image found in archive")
                    return@execute
                }
                saveThumbnail(bitmap, dest, maxWidth)
                promise.resolve("file://${dest.absolutePath}")
            } catch (e: Exception) {
                promise.reject("EXTRACTION_ERROR", e.message, e)
            }
        }
    }

    /** Creates a thumbnail from an already extracted page image. */
    @ReactMethod
    fun createThumbnail(imageUri: String, destPath: String, maxWidth: Int, promise: Promise) {
        executor.execute {
            try {
                val bytes = File(cleanUri(imageUri)).readBytes()
                val bitmap = decodeSampled(bytes, maxWidth) ?: throw IllegalStateException("Cannot decode image")
                val dest = File(cleanUri(destPath))
                saveThumbnail(bitmap, dest, maxWidth)
                promise.resolve("file://${dest.absolutePath}")
            } catch (e: Exception) {
                promise.reject("THUMBNAIL_ERROR", e.message, e)
            }
        }
    }

    // ─── PDF ────────────────────────────────────────────────────────────────

    @ReactMethod
    fun getPdfPageCount(pdfUri: String, promise: Promise) {
        executor.execute {
            try {
                openReadFd(pdfUri).use { pfd ->
                    PdfRenderer(pfd).use { promise.resolve(it.pageCount) }
                }
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", e.message, e)
            }
        }
    }

    /** Renders PDF page [pageNumber] (1-based) as a JPEG thumbnail. Resolves {uri,pageCount}. */
    @ReactMethod
    fun renderPdfCover(pdfUri: String, destPath: String, pageNumber: Int, maxWidth: Int, promise: Promise) {
        executor.execute {
            try {
                openReadFd(pdfUri).use { pfd ->
                    PdfRenderer(pfd).use { renderer ->
                        val count = renderer.pageCount
                        val index = (pageNumber - 1).coerceIn(0, count - 1)
                        renderer.openPage(index).use { page ->
                            val w = maxWidth
                            // Cap height so very tall (webtoon) pages never allocate huge bitmaps.
                            val h = (w.toLong() * page.height / page.width).toInt().coerceIn(1, w * 4)
                            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                            bitmap.eraseColor(Color.WHITE)
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                            val dest = File(cleanUri(destPath))
                            saveThumbnail(bitmap, dest, maxWidth)
                            val map = Arguments.createMap()
                            map.putString("uri", "file://${dest.absolutePath}")
                            map.putInt("pageCount", count)
                            promise.resolve(map)
                        }
                    }
                }
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", e.message, e)
            }
        }
    }

    /**
     * Copies a (content://) document into [destPath] atomically so readers that need a real file
     * path never see a half-written copy.
     */
    @ReactMethod
    fun copyToLocalFile(sourceUri: String, destPath: String, promise: Promise) {
        executor.execute {
            val lock = extractionLocks.getOrPut(destPath) { Any() }
            synchronized(lock) {
                try {
                    val dest = File(cleanUri(destPath))
                    val expected = fileSizeOf(sourceUri)
                    if (dest.exists() && (expected <= 0 || dest.length() == expected)) {
                        promise.resolve("file://${dest.absolutePath}")
                        return@execute
                    }
                    dest.parentFile?.mkdirs()
                    val tmp = File(dest.parentFile, dest.name + ".part")
                    val input = openInputStream(sourceUri) ?: throw IllegalStateException("Cannot open $sourceUri")
                    input.use { i -> FileOutputStream(tmp).use { o -> i.copyTo(o, 256 * 1024) } }
                    if (dest.exists()) dest.delete()
                    if (!tmp.renameTo(dest)) throw IllegalStateException("Cannot finalize copy")
                    dest.setLastModified(System.currentTimeMillis())
                    promise.resolve("file://${dest.absolutePath}")
                } catch (e: Exception) {
                    promise.reject("COPY_ERROR", e.message, e)
                } finally {
                    extractionLocks.remove(destPath)
                }
            }
        }
    }

    /** Total size in bytes of a folder (recursive). */
    @ReactMethod
    fun getFolderSize(path: String, promise: Promise) {
        executor.execute {
            try {
                val dir = File(cleanUri(path))
                promise.resolve(if (dir.exists()) dir.walkBottomUp().filter { it.isFile }.sumOf { it.length() }.toDouble() else 0.0)
            } catch (e: Exception) {
                promise.resolve(0.0)
            }
        }
    }

    // ─── Auto crop ──────────────────────────────────────────────────────────

    /**
     * Finds the content box of a page by scanning inwards from each edge until a row/column is no
     * longer the uniform border colour (white or black paper). Returns fractions [l, t, r, b].
     */
    private fun trimBox(file: File): DoubleArray {
        val full = doubleArrayOf(0.0, 0.0, 1.0, 1.0)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0) return full
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= 320) sample *= 2
        val bmp = BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: return full
        val box = contentBox(bmp)
        bmp.recycle()
        return box
    }

    /** Content box [l, t, r, b] (fractions) of a bitmap with a uniform white/black border. */
    private fun contentBox(source: Bitmap): DoubleArray {
        val full = doubleArrayOf(0.0, 0.0, 1.0, 1.0)
        // Analyse a small copy: margins do not need full resolution.
        val bmp = if (source.width > 400) {
            Bitmap.createScaledBitmap(source, 400, (source.height.toLong() * 400 / source.width).toInt().coerceAtLeast(1), false)
        } else source
        val w = bmp.width
        val h = bmp.height
        val px = IntArray(w * h)
        bmp.getPixels(px, 0, w, 0, 0, w, h)
        if (bmp !== source) bmp.recycle()

        fun luma(c: Int) = ((c shr 16 and 0xFF) * 299 + (c shr 8 and 0xFF) * 587 + (c and 0xFF) * 114) / 1000
        // Border colour = average luma of the four corners; only near-white or near-black paper is trimmed.
        val bg = (luma(px[0]) + luma(px[w - 1]) + luma(px[(h - 1) * w]) + luma(px[h * w - 1])) / 4
        if (bg in 40..215) return full
        val tolerance = 28
        fun isContent(c: Int) = Math.abs(luma(c) - bg) > tolerance

        fun rowHasContent(y: Int): Boolean {
            var n = 0
            for (x in 0 until w) if (isContent(px[y * w + x]) && ++n > w / 200 + 1) return true
            return false
        }
        fun colHasContent(x: Int): Boolean {
            var n = 0
            for (y in 0 until h) if (isContent(px[y * w + x]) && ++n > h / 200 + 1) return true
            return false
        }

        var top = 0
        while (top < h - 1 && !rowHasContent(top)) top++
        var bottom = h - 1
        while (bottom > top && !rowHasContent(bottom)) bottom--
        var left = 0
        while (left < w - 1 && !colHasContent(left)) left++
        var right = w - 1
        while (right > left && !colHasContent(right)) right--

        // Keep a small safety margin and ignore negligible or suspicious crops.
        val mx = (w * 0.01).toInt()
        val my = (h * 0.01).toInt()
        val l = (left - mx).coerceAtLeast(0) / w.toDouble()
        val t = (top - my).coerceAtLeast(0) / h.toDouble()
        val r = (right + 1 + mx).coerceAtMost(w) / w.toDouble()
        val b = (bottom + 1 + my).coerceAtMost(h) / h.toDouble()
        val keptArea = (r - l) * (b - t)
        if (keptArea > 0.97 || keptArea < 0.35) return full
        return doubleArrayOf(l, t, r, b)
    }

    /** Returns [{l,t,r,b}] per page for an extracted comic folder, cached in `trim.json`. */
    @ReactMethod
    fun computeTrimBoxes(destDir: String, promise: Promise) {
        executor.execute {
            try {
                val dir = File(cleanUri(destDir))
                val pages = readManifest(dir) ?: throw IllegalStateException("Comic is not extracted")
                val cache = File(dir, "trim.json")
                val boxes: JSONArray = try {
                    JSONArray(cache.readText()).takeIf { it.length() == pages.length() }
                } catch (_: Exception) {
                    null
                } ?: JSONArray().also { out ->
                    for (i in 0 until pages.length()) {
                        val box = trimBox(File(dir, pages.getJSONObject(i).getString("name")))
                        out.put(JSONArray().put(box[0]).put(box[1]).put(box[2]).put(box[3]))
                    }
                    val tmp = File(dir, "trim.json.tmp")
                    tmp.writeText(out.toString())
                    tmp.renameTo(cache)
                }
                val result = Arguments.createArray()
                for (i in 0 until boxes.length()) {
                    val b = boxes.getJSONArray(i)
                    result.pushMap(Arguments.createMap().apply {
                        putDouble("l", b.getDouble(0))
                        putDouble("t", b.getDouble(1))
                        putDouble("r", b.getDouble(2))
                        putDouble("b", b.getDouble(3))
                    })
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("TRIM_ERROR", e.message, e)
            }
        }
    }

    // Required by NativeEventEmitter.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    companion object {
        private const val MANIFEST = "manifest.json"
        private const val MANIFEST_VERSION = 2

        /** Natural, case-insensitive comparison ("2.jpg" < "10.jpg"), path-aware. */
        fun naturalCompare(s1: String, s2: String): Int {
            var i1 = 0
            var i2 = 0
            val len1 = s1.length
            val len2 = s2.length
            while (i1 < len1 && i2 < len2) {
                val c1 = s1[i1]
                val c2 = s2[i2]
                if (c1.isDigit() && c2.isDigit()) {
                    var end1 = i1
                    while (end1 < len1 && s1[end1].isDigit()) end1++
                    var end2 = i2
                    while (end2 < len2 && s2[end2].isDigit()) end2++
                    val n1 = s1.substring(i1, end1).trimStart('0')
                    val n2 = s2.substring(i2, end2).trimStart('0')
                    if (n1.length != n2.length) return n1.length - n2.length
                    val cmp = n1.compareTo(n2)
                    if (cmp != 0) return cmp
                    i1 = end1
                    i2 = end2
                } else {
                    // Treat path separators as lowest so "a/2.jpg" sorts before "a b/1.jpg".
                    val k1 = if (c1 == '/' || c1 == '\\') '\u0000' else c1.lowercaseChar()
                    val k2 = if (c2 == '/' || c2 == '\\') '\u0000' else c2.lowercaseChar()
                    if (k1 != k2) return k1.compareTo(k2)
                    i1++
                    i2++
                }
            }
            return (len1 - i1) - (len2 - i2)
        }
    }
}
