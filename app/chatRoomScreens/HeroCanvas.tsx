/**
 * HeroCanvas.tsx
 *
 * Full-screen editor for the profile Hero card: text on a colour theme or on a
 * photo. Presented modally with Cancel and Done. The canvas always renders
 * dark, like a photo editor, whatever the system appearance.
 */

import { GlassSurface, PressableScale, haptics } from '@/app/components/ui';
import { palette } from '@/src/theme';
import useAuth from '@/hooks/useAuth';
import { getAuthErrorMessage, updateProfile } from '@/services/AuthService';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { memo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
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

// User-chosen content colours for the Hero card (not app chrome). Stored by id on the profile.
export const HERO_THEMES: HeroTheme[] = [
    { id: 't1', label: 'Classic Purple', colors: ['#6733d0', '#4c1f9e'], textColor: '#ffffff' },
    { id: 't2', label: 'Ocean Blue', colors: ['#2b5876', '#4e4376'], textColor: '#ffffff' },
    { id: 't3', label: 'Sunset Orange', colors: ['#ff7e5f', '#feb47b'], textColor: '#ffffff' },
    { id: 't4', label: 'Minty Green', colors: ['#00b09b', '#96c93d'], textColor: '#ffffff' },
    { id: 't5', label: 'Dark Mode', colors: ['#1a1a2e', '#16213e'], textColor: '#ffffff' },
    { id: 't6', label: 'Soft Pink', colors: ['#fecfef', '#ff9a9e'], textColor: '#1a1a2e' },
];

/** The theme for a stored id; unknown ids fall back to Classic Purple. */
export const heroThemeFor = (id?: string) => HERO_THEMES.find((t) => t.id === id) ?? HERO_THEMES[0];

export interface HeroData {
    text: string;
    themeId: string;
    customImageUri?: string;
}

const HeroCanvas = ({ navigation, route }: any) => {
    const initialData: HeroData = route?.params?.initialData || {
        text: '',
        themeId: 't1',
    };

    const { updateUser } = useAuth();
    const [saving, setSaving] = useState(false);
    const [text, setText] = useState(initialData.text);
    const [selectedThemeId, setSelectedThemeId] = useState(initialData.themeId);
    const [customImageUri, setCustomImageUri] = useState<string | undefined>(initialData.customImageUri);
    const [isPickingImage, setIsPickingImage] = useState(false);

    const activeTheme = heroThemeFor(selectedThemeId);

    const handlePickImage = async () => {
        setIsPickingImage(true);
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please allow access to your media library to choose a background.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 5], // Story-ish ratio
                quality: 0.6,
                base64: true,
            });

            const asset = result.canceled ? undefined : result.assets?.[0];
            if (asset?.base64) {
                // Send the image itself: a local file path can't be seen by other users.
                setCustomImageUri(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
            }
        } finally {
            setIsPickingImage(false);
        }
    };

    const handleRemoveImage = () => {
        setCustomImageUri(undefined);
    };

    // Save here and go back to whichever screen opened the editor (Settings tab or a profile).
    const handleSave = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const response = await updateProfile({
                heroData: { text, themeId: selectedThemeId, customImageUri: customImageUri ?? '' },
            });
            // The server returns the stored image URL in place of the picked image data.
            if (response?.user?.heroData) updateUser({ heroData: response.user.heroData });
            haptics.success();
            navigation.goBack();
        } catch (err) {
            Alert.alert('Could not save', getAuthErrorMessage(err, 'Please try again.'));
        } finally {
            setSaving(false);
        }
    };

    const textColor = customImageUri ? '#ffffff' : activeTheme.textColor;

    return (
        <SafeAreaView style={S.safe} edges={['top', 'bottom']}>
            <StatusBar style="light" />

            {/* Header */}
            <View style={S.header}>
                <PressableScale onPress={() => navigation.goBack()} style={S.headerBtn} accessibilityRole="button" accessibilityLabel="Cancel">
                    <Text style={S.cancelText}>Cancel</Text>
                </PressableScale>
                <Text style={S.headerTitle}>Hero Card</Text>
                <PressableScale onPress={handleSave} disabled={saving} style={S.doneBtn} accessibilityRole="button" accessibilityLabel="Done">
                    {saving ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={S.doneText}>Done</Text>}
                </PressableScale>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

                {/* Canvas Area */}
                <View style={S.canvasWrapper}>
                    <View style={S.canvasCard}>
                        {customImageUri ? (
                            <>
                                <ExpoImage source={{ uri: customImageUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                                {/* Overlay to ensure text readability */}
                                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
                            </>
                        ) : (
                            <LinearGradient
                                colors={activeTheme.colors}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFillObject}
                            />
                        )}

                        <TextInput
                            style={[S.textInput, { color: textColor }]}
                            multiline
                            value={text}
                            onChangeText={setText}
                            placeholder="Type something amazing..."
                            placeholderTextColor={textColor + '99'}
                            selectionColor={textColor}
                            autoFocus
                            accessibilityLabel="Hero card text"
                        />

                        {/* Remove Image button */}
                        {customImageUri && (
                            <PressableScale onPress={handleRemoveImage} style={S.removeImageBtn} accessibilityRole="button" accessibilityLabel="Remove photo">
                                <GlassSurface variant="floating" style={S.removeImageGlass}>
                                    <Ionicons name="trash-outline" size={17} color="#fff" />
                                </GlassSurface>
                            </PressableScale>
                        )}
                    </View>
                </View>

                {/* Bottom Toolbar */}
                <View style={S.toolbar}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.toolbarScroll}>

                        {/* Custom Image Picker */}
                        <PressableScale
                            onPress={handlePickImage}
                            style={[S.pickerBtn, !!customImageUri && S.pickerBtnOn]}
                            disabled={isPickingImage}
                            accessibilityRole="button"
                            accessibilityLabel="Use a photo"
                            accessibilityState={{ selected: !!customImageUri }}
                        >
                            {isPickingImage ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Ionicons name="image-outline" size={22} color="#fff" />
                            )}
                        </PressableScale>

                        <View style={S.separator} />

                        {/* Solid Themes */}
                        {HERO_THEMES.map(theme => {
                            // If an image is selected, we don't show the "selected" ring on colors
                            const isSelected = !customImageUri && theme.id === selectedThemeId;
                            return (
                                <PressableScale
                                    key={theme.id}
                                    onPress={() => {
                                        haptics.selection();
                                        setCustomImageUri(undefined); // Clear image if color chosen
                                        setSelectedThemeId(theme.id);
                                    }}
                                    style={[S.colorRing, isSelected && S.colorRingSelected]}
                                    accessibilityRole="radio"
                                    accessibilityLabel={theme.label}
                                    accessibilityState={{ selected: isSelected }}
                                >
                                    <LinearGradient colors={theme.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={S.colorCircle}>
                                        {isSelected && <Ionicons name="checkmark" size={20} color={theme.textColor} />}
                                    </LinearGradient>
                                </PressableScale>
                            );
                        })}
                    </ScrollView>
                </View>

            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const S = StyleSheet.create({
    safe: { flex: 1, backgroundColor: palette.night950 },

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        zIndex: 10,
    },
    headerBtn: {
        minWidth: 64,
        height: 44,
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    cancelText: {
        fontSize: 17,
        color: '#ffffff',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#ffffff',
    },
    doneBtn: {
        minWidth: 64,
        height: 36,
        backgroundColor: palette.purple600,
        paddingHorizontal: 16,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    doneText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ffffff',
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
        height: '100%',
        maxHeight: 560,
        borderRadius: 28,
        overflow: 'hidden',
        justifyContent: 'center',
        padding: 24,
    },
    textInput: {
        fontSize: 24,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 32,
        minHeight: 100,
        zIndex: 1,
    },
    removeImageBtn: {
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 2,
    },
    removeImageGlass: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },

    toolbar: {
        paddingBottom: 16,
        paddingTop: 12,
    },
    toolbarScroll: {
        paddingHorizontal: 20,
        alignItems: 'center',
        gap: 14,
    },
    pickerBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pickerBtnOn: {
        borderWidth: 2,
        borderColor: '#ffffff',
    },
    separator: {
        width: StyleSheet.hairlineWidth,
        height: 32,
        backgroundColor: 'rgba(255,255,255,0.24)',
    },
    colorRing: {
        width: 50,
        height: 50,
        borderRadius: 25,
        padding: 3,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    colorRingSelected: {
        borderColor: '#ffffff',
    },
    colorCircle: {
        flex: 1,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default memo(HeroCanvas);
