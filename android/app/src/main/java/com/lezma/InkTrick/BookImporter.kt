package com.lezma.InkTrick

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.io.InputStream

/**
 * Brings books into the InkTrick library folder: files shared from Google Drive ("Abrir con" /
 * "Enviar a"), from a file manager, or picked in Downloads. Only real books get in: the extension
 * must be .pdf/.epub/.cbz/.cbr and the first bytes must match (%PDF, ZIP or RAR), so a renamed
 * file or anything else is rejected before touching the library.
 */
object BookImporter {
    /** URIs received while JS was not listening yet (e.g. InkTrick launched by "Abrir con"). */
    private val pending = mutableListOf<Uri>()
    var onNewImports: (() -> Unit)? = null

    private val BOOK_EXTENSIONS = setOf("pdf", "epub", "cbz", "cbr")

    val BOOK_MIME_TYPES = arrayOf(
        "application/pdf", "application/epub+zip",
        "application/vnd.comicbook+zip", "application/vnd.comicbook-rar",
        "application/x-cbz", "application/x-cbr", "application/zip",
        "application/x-rar-compressed", "application/vnd.rar", "application/octet-stream",
    )

    fun handleIntent(intent: Intent?) {
        if (intent == null) return
        val uris = mutableListOf<Uri>()
        when (intent.action) {
            Intent.ACTION_VIEW -> intent.data?.takeIf { it.scheme == ContentResolver.SCHEME_CONTENT }?.let { uris += it }
            Intent.ACTION_SEND -> streamExtra(intent)?.let { uris += it }
            Intent.ACTION_SEND_MULTIPLE -> uris += streamListExtra(intent)
        }
        if (uris.isEmpty()) return
        synchronized(pending) { pending += uris }
        // Consume it: a recreated activity must not import the same file again.
        intent.action = Intent.ACTION_MAIN
        intent.data = null
        onNewImports?.invoke()
    }

    fun takePending(): List<Uri> = synchronized(pending) { pending.toList().also { pending.clear() } }

    @Suppress("DEPRECATION")
    private fun streamExtra(intent: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else intent.getParcelableExtra(Intent.EXTRA_STREAM)

    @Suppress("DEPRECATION")
    private fun streamListExtra(intent: Intent): List<Uri> =
        (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)).orEmpty()

    /**
     * Copies [source] into the library folder [treeUri] (a SAF tree). With [move], the original is
     * deleted afterwards when its provider allows it (Downloads does), so space is not doubled.
     * Result: { status: imported | duplicate | rejected | error, name, reason? }.
     */
    fun import(resolver: ContentResolver, source: Uri, treeUri: Uri, move: Boolean): WritableMap {
        val result = Arguments.createMap()
        val (rawName, size) = describe(resolver, source)
        var name = rawName ?: source.lastPathSegment?.substringAfterLast('/') ?: "libro"
        result.putString("name", name)
        try {
            val head = ByteArray(8)
            val read = resolver.openInputStream(source)?.use { readFully(it, head) } ?: 0
            val kind = kindOf(head, read)
                ?: return reject(result, "No es un libro (PDF, EPUB, CBR o CBZ).")
            val ext = name.substringAfterLast('.', "").lowercase()
            val allowed = when (kind) {
                Kind.PDF -> setOf("pdf")
                Kind.ZIP -> setOf("cbz", "epub", "cbr")
                Kind.RAR -> setOf("cbr")
            }
            if (ext.isEmpty()) {
                // No extension (some share targets drop it): name it after its content.
                name += "." + when (kind) { Kind.PDF -> "pdf"; Kind.ZIP -> "cbz"; Kind.RAR -> "cbr" }
            } else if (ext !in allowed) {
                return reject(result, if (ext in BOOK_EXTENSIONS) "El archivo está dañado o no coincide con su tipo."
                else "Solo se admiten libros PDF, EPUB, CBR o CBZ.")
            }
            result.putString("name", name)

            val parent = DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
            val existing = children(resolver, treeUri)
            val same = existing[name]
            if (same != null && size != null && same == size) {
                // Never delete the source here: it may be that very file (picked inside the folder).
                result.putString("status", "duplicate")
                return result
            }
            var target = name
            var n = 2
            while (existing.containsKey(target)) target = "${name.substringBeforeLast('.')} ($n).${name.substringAfterLast('.')}".also { n++ }
            val mime = when (target.substringAfterLast('.').lowercase()) {
                "pdf" -> "application/pdf"; "epub" -> "application/epub+zip"; else -> "application/octet-stream"
            }
            val created = DocumentsContract.createDocument(resolver, parent, mime, target)
                ?: return error(result, "No se pudo crear el archivo en la carpeta InkTrick.")
            try {
                resolver.openInputStream(source)!!.use { input ->
                    resolver.openOutputStream(created, "w")!!.use { output -> input.copyTo(output, 256 * 1024) }
                }
            } catch (e: Exception) {
                deleteQuietly(resolver, created)
                return error(result, "No se pudo copiar el libro (¿falta espacio?).")
            }
            if (move) deleteQuietly(resolver, source)
            result.putString("name", target)
            result.putString("status", "imported")
        } catch (e: Exception) {
            return error(result, e.message ?: "Error al importar.")
        }
        return result
    }

    private enum class Kind { PDF, ZIP, RAR }

    private fun kindOf(b: ByteArray, n: Int): Kind? = when {
        n >= 4 && b[0] == '%'.code.toByte() && b[1] == 'P'.code.toByte() && b[2] == 'D'.code.toByte() && b[3] == 'F'.code.toByte() -> Kind.PDF
        n >= 4 && b[0] == 0x50.toByte() && b[1] == 0x4B.toByte() && b[2] == 0x03.toByte() && b[3] == 0x04.toByte() -> Kind.ZIP
        n >= 4 && b[0] == 'R'.code.toByte() && b[1] == 'a'.code.toByte() && b[2] == 'r'.code.toByte() && b[3] == '!'.code.toByte() -> Kind.RAR
        else -> null
    }

    private fun readFully(input: InputStream, buffer: ByteArray): Int {
        var total = 0
        while (total < buffer.size) {
            val r = input.read(buffer, total, buffer.size - total)
            if (r <= 0) break
            total += r
        }
        return total
    }

    private fun describe(resolver: ContentResolver, uri: Uri): Pair<String?, Long?> {
        return try {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (!c.moveToFirst()) return null to null
                val name = c.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { c.getString(it) }
                val size = c.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 && !c.isNull(it) }?.let { c.getLong(it) }
                name to size
            } ?: (null to null)
        } catch (_: Exception) {
            null to null
        }
    }

    /** Display name → size of the files directly inside the library folder. */
    private fun children(resolver: ContentResolver, tree: Uri): Map<String, Long> {
        val uri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
        val map = HashMap<String, Long>()
        try {
            resolver.query(uri, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_SIZE), null, null, null)?.use { c ->
                while (c.moveToNext()) map[c.getString(0)] = if (c.isNull(1)) -1 else c.getLong(1)
            }
        } catch (_: Exception) {}
        return map
    }

    private fun deleteQuietly(resolver: ContentResolver, uri: Uri) {
        try { DocumentsContract.deleteDocument(resolver, uri) } catch (_: Exception) {}
    }

    private fun reject(map: WritableMap, reason: String) = map.apply { putString("status", "rejected"); putString("reason", reason) }
    private fun error(map: WritableMap, reason: String) = map.apply { putString("status", "error"); putString("reason", reason) }
}
