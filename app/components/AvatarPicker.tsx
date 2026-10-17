import { makeStyles } from '@/src/theme';
import { Image as ExpoImage } from 'expo-image';
import React, { memo, useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    Text,
    View,
    useWindowDimensions,
    type ImageStyle,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from 'react-native';

type AvatarPickerProps = {
    uri?: string;
    name?: string;
    size?: number;
    style?: StyleProp<ImageStyle>;
    textStyle?: StyleProp<TextStyle>;
    fallbackStyle?: StyleProp<ViewStyle>;
    previewEnabled?: boolean;
};

/** Round avatar with an initial fallback; tapping a photo opens a large preview. */
const AvatarPicker = ({
    uri,
    name,
    size = 48,
    style,
    textStyle,
    fallbackStyle,
    previewEnabled = true,
}: AvatarPickerProps) => {
    const s = useStyles();
    const [previewVisible, setPreviewVisible] = useState(false);
    const { width, height } = useWindowDimensions();

    const safeUri = typeof uri === 'string' ? uri.trim() : '';
    const hasImage = safeUri.length > 0;
    const initial = useMemo(() => String(name || '?').slice(0, 1).toUpperCase(), [name]);
    const canPreview = hasImage && previewEnabled;

    const closePreview = () => setPreviewVisible(false);
    const openPreview = () => {
        if (canPreview) setPreviewVisible(true);
    };

    const largeSize = Math.min(Math.max(220, Math.floor(width * 0.72)), Math.floor(height * 0.6));

    return (
        <>
            <Pressable
                onPress={openPreview}
                disabled={!canPreview}
                style={s.touchWrap}
                accessibilityRole={canPreview ? 'imagebutton' : 'image'}
                accessibilityLabel={canPreview ? `View ${name || 'profile'} photo` : `${name || 'User'} avatar`}
            >
                {hasImage ? (
                    <ExpoImage
                        source={{ uri: safeUri }}
                        style={[{ width: size, height: size, borderRadius: size / 2 }, s.image, style]}
                        contentFit="cover"
                        transition={120}
                        cachePolicy="memory-disk"
                    />
                ) : (
                    <View
                        style={[
                            s.fallback,
                            { width: size, height: size, borderRadius: size / 2 },
                            style,
                            fallbackStyle,
                        ]}
                    >
                        <Text style={[s.initialText, { fontSize: Math.round(size * 0.4) }, textStyle]}>{initial}</Text>
                    </View>
                )}
            </Pressable>

            <Modal visible={previewVisible} animationType="fade" transparent onRequestClose={closePreview} statusBarTranslucent>
                <Pressable
                    style={s.modalBackdrop}
                    onPress={closePreview}
                    accessibilityRole="button"
                    accessibilityLabel="Close photo"
                >
                    <View style={s.modalCard}>
                        <ExpoImage
                            source={{ uri: safeUri }}
                            style={{ width: largeSize, height: largeSize, borderRadius: largeSize / 2 }}
                            contentFit="cover"
                            transition={120}
                            cachePolicy="memory-disk"
                            accessibilityLabel={`${name || 'User'} photo`}
                        />
                        <Text style={s.modalName} numberOfLines={1}>
                            {String(name || 'User')}
                        </Text>
                    </View>
                </Pressable>
            </Modal>
        </>
    );
};

const useStyles = makeStyles((t) => ({
    touchWrap: {
        overflow: 'hidden',
        borderRadius: t.radius.pill,
    },
    image: {
        backgroundColor: t.colors.avatarFill,
    },
    fallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.colors.avatarFill,
    },
    initialText: {
        color: t.colors.avatarInitial,
        fontWeight: '700',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.82)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: t.space.xl,
    },
    modalCard: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space.md,
    },
    modalName: {
        ...t.type.headline,
        color: '#ffffff',
        maxWidth: 260,
    },
}));

export default memo(AvatarPicker);
