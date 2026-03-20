import { Image as ExpoImage } from 'expo-image';
import React, { memo, useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
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

const AvatarPicker = ({
    uri,
    name,
    size = 48,
    style,
    textStyle,
    fallbackStyle,
    previewEnabled = true,
}: AvatarPickerProps) => {
    const [previewVisible, setPreviewVisible] = useState(false);
    const { width, height } = useWindowDimensions();

    const safeUri = typeof uri === 'string' ? uri.trim() : '';
    const hasImage = safeUri.length > 0;
    const initial = useMemo(() => String(name || '?').slice(0, 1).toUpperCase(), [name]);

    const closePreview = () => setPreviewVisible(false);
    const openPreview = () => {
        if (!hasImage || !previewEnabled) return;
        setPreviewVisible(true);
    };

    const largeSize = Math.min(Math.max(220, Math.floor(width * 0.72)), Math.floor(height * 0.6));

    return (
        <>
            <Pressable
                onPress={openPreview}
                disabled={!hasImage || !previewEnabled}
                style={[styles.touchWrap, !hasImage && styles.touchWrapDisabled]}
            >
                {hasImage ? (
                    <ExpoImage
                        source={{ uri: safeUri }}
                        style={[{ width: size, height: size, borderRadius: size / 2 },]}
                        contentFit="cover"
                        transition={120}
                        cachePolicy="memory-disk"
                    />
                ) : (
                    <View
                        style={[
                            styles.fallback,
                            { width: size, height: size, borderRadius: size / 2 },
                            fallbackStyle,
                        ]}
                    >
                        <Text style={[styles.initialText, textStyle]}>{initial}</Text>
                    </View>
                )}
            </Pressable>

            <Modal
                visible={previewVisible}
                animationType="fade"
                transparent
                onRequestClose={closePreview}
            >
                <Pressable style={styles.modalBackdrop} onPress={closePreview}>
                    <Pressable style={styles.modalCard} onPress={() => {}}>
                        <ExpoImage
                            source={{ uri: safeUri }}
                            style={{ width: largeSize, height: largeSize, borderRadius: largeSize / 2 }}
                            contentFit="cover"
                            transition={120}
                            cachePolicy="memory-disk"
                        />
                        <Text style={styles.modalName} numberOfLines={1}>
                            {String(name || 'User')}
                        </Text>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    touchWrap: {
        overflow: 'hidden',
    },
    touchWrapDisabled: {
        opacity: 1,
    },
    fallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#e9e2ff',
    },
    initialText: {
        color: '#350d81',
        fontSize: 18,
        fontWeight: '700',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.78)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    modalCard: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    modalName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        maxWidth: 260,
    },
});

export default memo(AvatarPicker);
