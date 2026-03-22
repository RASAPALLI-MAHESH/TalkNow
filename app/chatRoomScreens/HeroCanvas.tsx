/**
 * HeroCanvas.tsx
 *
 * An immersive, rich editor for the profile Hero Description Card.
 * Feels like Instagram/WhatsApp status editor.
 */

import RippleButton from '@/app/components/RippleButton';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { memo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type HeroTheme = {
    id: string;
    label: string;
    colors: [string, string];
    textColor: string;
};

const THEMES: HeroTheme[] = [
    { id: 't1', label: 'Classic Purple', colors: ['#6733d0', '#4c1f9e'], textColor: '#ffffff' },
    { id: 't2', label: 'Ocean Blue', colors: ['#2b5876', '#4e4376'], textColor: '#ffffff' },
    { id: 't3', label: 'Sunset Orange', colors: ['#ff7e5f', '#feb47b'], textColor: '#ffffff' },
    { id: 't4', label: 'Minty Green', colors: ['#00b09b', '#96c93d'], textColor: '#ffffff' },
    { id: 't5', label: 'Dark Mode', colors: ['#1a1a2e', '#16213e'], textColor: '#ffffff' },
    { id: 't6', label: 'Soft Pink', colors: ['#fecfef', '#ff9a9e'], textColor: '#1a1a2e' },
];

export interface HeroData {
    text: string;
    themeId: string;
    customImageUri?: string;
}

const { width: W, height: H } = Dimensions.get('window');

const HeroCanvas = ({ navigation, route }: any) => {
    const initialData: HeroData = route?.params?.initialData || {
        text: '',
        themeId: 't1',
    };

    const [text, setText] = useState(initialData.text);
    const [selectedThemeId, setSelectedThemeId] = useState(initialData.themeId);
    const [customImageUri, setCustomImageUri] = useState<string | undefined>(initialData.customImageUri);
    const [isPickingImage, setIsPickingImage] = useState(false);

    const activeTheme = THEMES.find(t => t.id === selectedThemeId) || THEMES[0];

    const handlePickImage = async () => {
        setIsPickingImage(true);
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please allow access to your media library to choose a background.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 5], // Story-ish ratio
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setCustomImageUri(result.assets[0].uri);
            }
        } finally {
            setIsPickingImage(false);
        }
    };

    const handleRemoveImage = () => {
        setCustomImageUri(undefined);
    };

    const handleSave = () => {
        const newData = {
            text,
            themeId: selectedThemeId,
            customImageUri,
        };
        if (route.params?.onSave) {
            route.params.onSave(newData);
            navigation.goBack();
        } else {
            // Fallback: forcefully pass to FullProfile if callback stripped
            navigation.navigate({
                name: 'FullProfile',
                params: { updatedHeroData: newData },
                merge: true
            });
        }
    };

    const textColor = customImageUri ? '#ffffff' : activeTheme.textColor;

    return (
        <SafeAreaView style={S.safe} edges={['top', 'bottom']}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />
            
            {/* Header */}
            <View style={S.header}>
                <RippleButton onPress={() => navigation.goBack()} borderless style={S.headerBtn}>
                    <Ionicons name="close" size={28} color="#fff" />
                </RippleButton>
                <RippleButton onPress={handleSave} style={S.doneBtn}>
                    <Text style={S.doneText}>Done</Text>
                </RippleButton>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                
                {/* Canvas Area */}
                <View style={S.canvasWrapper}>
                    <View style={[
                        S.canvasCard,
                        !customImageUri && { backgroundColor: activeTheme.colors[0] }
                    ]}>
                        
                        {/* Background Image if selected */}
                        {customImageUri && (
                            <>
                                <ExpoImage source={{ uri: customImageUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                                {/* Overlay to ensure text readability */}
                                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
                            </>
                        )}

                        <TextInput
                            style={[S.textInput, { color: textColor }]}
                            multiline
                            value={text}
                            onChangeText={setText}
                            placeholder="Type something amazing..."
                            placeholderTextColor={textColor + '80'} // 50% opacity
                            selectionColor={textColor}
                            autoFocus
                        />

                        {/* Remove Image button */}
                        {customImageUri && (
                            <RippleButton onPress={handleRemoveImage} style={S.removeImageBtn}>
                                <Ionicons name="trash-outline" size={16} color="#fff" />
                            </RippleButton>
                        )}
                    </View>
                </View>

                {/* Bottom Toolbar */}
                <View style={S.toolbar}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.toolbarScroll}>
                        
                        {/* Custom Image Picker */}
                        <RippleButton onPress={handlePickImage} style={S.pickerBtn} disabled={isPickingImage}>
                            {isPickingImage ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Ionicons name="image-outline" size={24} color="#fff" />
                            )}
                        </RippleButton>

                        <View style={S.separator} />

                        {/* Solid Themes */}
                        {THEMES.map(theme => {
                            // If an image is selected, we don't show the "selected" ring on colors
                            const isSelected = !customImageUri && theme.id === selectedThemeId;
                            return (
                                <RippleButton
                                    key={theme.id}
                                    onPress={() => {
                                        setCustomImageUri(undefined); // Clear image if color chosen
                                        setSelectedThemeId(theme.id);
                                    }}
                                    style={[
                                        S.colorCircle,
                                        { backgroundColor: theme.colors[0] },
                                        isSelected && S.colorCircleSelected
                                    ]}
                                >
                                    {isSelected && <Ionicons name="checkmark" size={20} color={theme.textColor} />}
                                </RippleButton>
                            );
                        })}
                    </ScrollView>
                </View>

            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const S = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#000000' },
    
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        zIndex: 10,
    },
    headerBtn: {
        width: 40, height: 40,
        borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
    },
    doneBtn: {
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    doneText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#000',
    },

    canvasWrapper: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    canvasCard: {
        width: '100%',
        height: '100%', // Maximize space
        maxHeight: H * 0.65, // Let keyboard breathe
        borderRadius: 24,
        overflow: 'hidden',
        justifyContent: 'center',
        padding: 24,
    },
    textInput: {
        fontSize: 24,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 34,
        minHeight: 100,
        zIndex: 1,
    },
    removeImageBtn: {
        position: 'absolute',
        bottom: 16,
        right: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        width: 36, height: 36,
        borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
        zIndex: 2,
    },

    toolbar: {
        paddingBottom: 20,
        paddingTop: 12,
    },
    toolbarScroll: {
        paddingHorizontal: 20,
        alignItems: 'center',
        gap: 16,
    },
    pickerBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#1a1a1a',
        borderWidth: 1,
        borderColor: '#333',
        alignItems: 'center',
        justifyContent: 'center',
    },
    separator: {
        width: 1,
        height: 32,
        backgroundColor: '#333',
    },
    colorCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    colorCircleSelected: {
        borderColor: '#ffffff',
        transform: [{ scale: 1.1 }],
    },
});

export default memo(HeroCanvas);
