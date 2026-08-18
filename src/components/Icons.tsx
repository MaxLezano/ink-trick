/**
 * InkTrick - Clean Monochromatic Vector Icons
 * Componentes de íconos vectoriales puros sin dependencias nativas externas.
 * Garantiza 0ms de carga, 0 dependencias frágiles y 100% estabilidad en Android y iOS.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';

interface IconProps {
  size?: number;
  color?: string;
}

/**
 * Ícono de Estrella (Favorito)
 */
export const StarIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Estrella geométrica estilizada */}
      <View
        style={{
          width: s * 0.75,
          height: s * 0.75,
          borderWidth: 1.8,
          borderColor: color,
          borderRadius: 3,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
};

/**
 * Ícono de Doble Tilde (Marcar como leído)
 */
export const CheckDoneIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: size * 0.8, height: size * 0.5, flexDirection: 'row', alignItems: 'center' }}>
        {/* Primera tilde */}
        <View style={{ width: size * 0.35, height: size * 0.45, borderBottomWidth: 2, borderRightWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }, { translateY: -2 }] }} />
        {/* Segunda tilde */}
        <View style={{ width: size * 0.35, height: size * 0.45, borderBottomWidth: 2, borderRightWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }, { translateY: -2 }], marginLeft: -size * 0.18 }} />
      </View>
    </View>
  );
};

/**
 * Ícono de Imagen / Foto (Cambiar portada)
 */
export const ImageIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.85,
          height: size * 0.7,
          borderRadius: 3,
          borderWidth: 1.8,
          borderColor: color,
          justifyContent: 'flex-end',
          overflow: 'hidden',
          padding: 1.5,
        }}
      >
        {/* Sol */}
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 3,
            width: size * 0.2,
            height: size * 0.2,
            borderRadius: (size * 0.2) / 2,
            backgroundColor: color,
          }}
        />
        {/* Montañas */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
          <View
            style={{
              width: size * 0.35,
              height: size * 0.3,
              backgroundColor: color,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
              transform: [{ rotate: '15deg' }],
            }}
          />
          <View
            style={{
              width: size * 0.4,
              height: size * 0.4,
              backgroundColor: color,
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              marginLeft: -2,
            }}
          />
        </View>
      </View>
    </View>
  );
};

/**
 * Ícono de Carpeta (Agrupar / Colecciones)
 */
export const FolderIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.85, height: size * 0.65, justifyContent: 'flex-end' }}>
        {/* Pestaña superior */}
        <View
          style={{
            width: size * 0.4,
            height: size * 0.2,
            backgroundColor: color,
            borderTopLeftRadius: 2,
            borderTopRightRadius: 4,
            marginBottom: -1,
          }}
        />
        {/* Cuerpo de la carpeta */}
        <View
          style={{
            width: size * 0.85,
            height: size * 0.5,
            borderWidth: 1.8,
            borderColor: color,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
};

/**
 * Ícono de Papelera (Eliminar)
 */
export const TrashIcon: React.FC<IconProps> = ({ size = 20, color = '#FF4D4D' }) => {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Tapa y manija */}
      <View style={{ width: size * 0.35, height: 1.5, backgroundColor: color, borderTopLeftRadius: 1, borderTopRightRadius: 1, marginBottom: 1 }} />
      <View style={{ width: size * 0.75, height: 1.5, backgroundColor: color, borderRadius: 1, marginBottom: 2 }} />
      {/* Contenedor */}
      <View
        style={{
          width: size * 0.6,
          height: size * 0.55,
          borderWidth: 1.6,
          borderColor: color,
          borderTopWidth: 0,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          alignItems: 'center',
        }}
      >
        <View style={{ width: 1.2, height: size * 0.3, backgroundColor: color, borderRadius: 0.5 }} />
        <View style={{ width: 1.2, height: size * 0.3, backgroundColor: color, borderRadius: 0.5 }} />
      </View>
    </View>
  );
};

/**
 * Ícono de Engranaje / Ajustes
 */
export const GearIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      {/* Dientes del engranaje */}
      <View style={{ position: 'absolute', width: s * 0.82, height: s * 0.82, borderWidth: 2, borderColor: color, borderRadius: 3 }} />
      <View style={{ position: 'absolute', width: s * 0.82, height: s * 0.82, borderWidth: 2, borderColor: color, borderRadius: 3, transform: [{ rotate: '45deg' }] }} />
      {/* Aro interior */}
      <View
        style={{
          width: s * 0.55,
          height: s * 0.55,
          borderRadius: (s * 0.55) / 2,
          backgroundColor: '#0A0A0A',
          borderWidth: 1.8,
          borderColor: color,
        }}
      />
    </View>
  );
};

/**
 * Ícono de Flecha Atrás (Volver)
 */
export const BackIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.45,
          height: size * 0.45,
          borderLeftWidth: 2.2,
          borderBottomWidth: 2.2,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
          marginLeft: 2,
        }}
      />
    </View>
  );
};

/**
 * Ícono de Cerrar (X)
 */
export const CloseIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.65, height: 2, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }], position: 'absolute' }} />
      <View style={{ width: size * 0.65, height: 2, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }], position: 'absolute' }} />
    </View>
  );
};

/**
 * Ícono de Refrescar / Actualizar
 */
export const RefreshIcon: React.FC<IconProps> = ({ size = 18, color = '#0A0A0A' }) => {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.75,
          height: size * 0.75,
          borderRadius: (size * 0.75) / 2,
          borderWidth: 1.8,
          borderColor: color,
          borderTopColor: 'transparent',
        }}
      />
      {/* Flechita */}
      <View
        style={{
          position: 'absolute',
          top: 1,
          right: 2,
          width: 0,
          height: 0,
          borderLeftWidth: 3,
          borderRightWidth: 3,
          borderBottomWidth: 4,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
          transform: [{ rotate: '30deg' }],
        }}
      />
    </View>
  );
};
