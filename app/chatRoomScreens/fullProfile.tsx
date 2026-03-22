/**
 * fullProfile.tsx — Custom Wireframe Implementation
 *
 * Implements the explicit layout requested by the user:
 * - Header: Back arrow.
 * - Top Row: Avatar + @username (Left) | FULL NAME + Bio (Right)
 * - Actions: Follow Request / Portfolio / Share
 * - Hero Description Card: Large gradient/image card spanning the width.
 *   - If isSelf, tapping opens HeroCanvas for creative editing.
 * - Highlights Row: 4 specific circles (WhatsApp, Instagram, LinkedIn, Twitter).
 * - Links: AddLink component.
 */

import AddLink, { type LinkEntry } from '@/app/components/AddLink';
import RippleButton from '@/app/components/RippleButton';
import useAuth from '@/hooks/useAuth';
import { followUser, unfollowUser, getUserProfile, updateProfile } from '@/services/AuthService';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    UIManager,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HeroData } from './HeroCanvas'; // We'll import the type

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ─── Design tokens ─── */
const NAVY          = '#1a4358'; // from the user's mockup button color
const NAVY_PRESSED  = '#123040';
const GREEN_GRAD    = '#9dbb71'; // from mockup hero card
const WHITE         = '#ffffff';
const INK           = '#111111';
const INK_MUTED     = '#666666';
const CIRCLE_BG     = '#d9d9d9'; // placeholder gray
const SEPARATOR     = 'rgba(0,0,0,0.08)';

const { width: W, height: H } = Dimensions.get('window');

/* ─── Social Links Logic ─── */
type SocialPlatform = 'whatsapp' | 'instagram' | 'linkedin' | 'twitter';
const SOCIAL_ICONS: Record<SocialPlatform, keyof typeof Ionicons.glyphMap> = {
    whatsapp: 'logo-whatsapp',
    instagram: 'logo-instagram',
    linkedin: 'logo-linkedin',
    twitter: 'logo-twitter',
};

const SocialCircle = ({
    platform,
    url,
    isSelf,
    onPress,
}: {
    platform: SocialPlatform;
    url?: string;
    isSelf: boolean;
    onPress: () => void;
}) => {
    // If not self and no url exists, hide it.
    if (!isSelf && !url) return null;

    const hasUrl = !!url;

    return (
        <RippleButton
            onPress={onPress}
            style={[S.socialCircle, hasUrl ? S.socialCircleActive : S.socialCircleEmpty]}
            rippleColor="rgba(0,0,0,0.1)"
        >
            {hasUrl ? (
                <Ionicons name={SOCIAL_ICONS[platform]} size={28} color={WHITE} />
            ) : (
                <Ionicons name={SOCIAL_ICONS[platform]} size={28} color="#999" />
            )}
        </RippleButton>
    );
};

/* ─── FullProfile Screen ─── */
type FullProfileProps = {
    navigation?: any;
    route?: any;
    isSettingsTab?: boolean;
};

const FullProfile = ({ navigation, route, isSettingsTab }: FullProfileProps) => {
    const insets = useSafeAreaInsets();
    const { user: me, Logout, updateUser } = useAuth();

    // If it's the settings tab, we are viewing our OWN profile.
    const peerId       = isSettingsTab ? String(me?.id ?? '') : String(route?.params?.peerId ?? '').trim();
    const peerUsername = isSettingsTab ? String(me?.username ?? 'Unknown') : String(route?.params?.peerUsername ?? 'Unknown').trim() || 'Unknown';
    const peerAvatar   = isSettingsTab ? (me as any)?.avatar || '' : route?.params?.peerAvatar || '';

    const isSelf = isSettingsTab || me?.id === peerId;

    /* State */
    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [links, setLinks] = useState<LinkEntry[]>([]);

    const [localPeerAvatar, setLocalPeerAvatar] = useState(peerAvatar);
    const [isPickingAvatar, setIsPickingAvatar] = useState(false);

    // Social URLs
    const [socialUrls, setSocialUrls] = useState<Record<SocialPlatform, string>>({
        whatsapp: '',
        instagram: '',
        linkedin: '',
        twitter: '',
    });

    // Editable text
    const [editName, setEditName] = useState(peerUsername.toUpperCase());
    const [editBio, setEditBio] = useState('Bio of the user');

    // Modals & animations
    const [imgViewerVisible, setImgViewerVisible] = useState(false);
    const [socialDialogVisible, setSocialDialogVisible] = useState(false);
    const [activeSocialPlatform, setActiveSocialPlatform] = useState<SocialPlatform | null>(null);
    const [socialInputUrl, setSocialInputUrl] = useState('');

    const avatarScale = useRef(new Animated.Value(1)).current;

    // Hero Data — null means user hasn't configured it yet
    const [heroData, setHeroData] = useState<HeroData | null>(null);
    const [heroExpanded, setHeroExpanded] = useState(false);

    /* Fetch Profile Data on Mount */
    useEffect(() => {
        if (!peerId) return;
        getUserProfile(peerId).then(data => {
            if (data.Firstname) setEditName(data.Firstname);
            if (data.bio) setEditBio(data.bio);
            if (data.profilePicture) setLocalPeerAvatar(data.profilePicture);
            if (data.heroData) setHeroData(data.heroData);
            if (data.socialUrls) setSocialUrls(data.socialUrls);
            if (data.customLinks) setLinks(data.customLinks);
        }).catch(console.error);
    }, [peerId]);

    /* Handle Return from HeroCanvas fallback */
    useEffect(() => {
        if (route?.params?.updatedHeroData) {
            const newData = route.params.updatedHeroData;
            setHeroData(newData);
            updateProfile({ heroData: newData }).catch(console.error);
            updateUser({ heroData: newData });
            // Clear the param
            navigation.setParams({ updatedHeroData: undefined });
        }
    }, [route?.params?.updatedHeroData]);

    /* Animation */
    const screenScale   = useRef(new Animated.Value(0.94)).current;
    const screenOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(screenScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 9 }),
            Animated.timing(screenOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleBack = useCallback(() => {
        Animated.parallel([
            Animated.spring(screenScale, { toValue: 0.94, useNativeDriver: true, speed: 60 }),
            Animated.timing(screenOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        ]).start(() => navigation.goBack());
    }, [navigation]);

    const handleToggleFollow = async () => {
        if (!peerId || followLoading) return;
        setFollowLoading(true);
        try {
            if (isFollowing) {
                await unfollowUser(peerId);
                setIsFollowing(false);
            } else {
                await followUser(peerId);
                setIsFollowing(true);
            }
        } finally {
            setFollowLoading(false);
        }
    };

    const handlePickAvatar = async () => {
        if (isPickingAvatar) return;
        setIsPickingAvatar(true);
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') return;
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.6,
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
                const uri = result.assets[0].uri;
                setLocalPeerAvatar(uri);
                updateProfile({ profilePicture: uri }).catch(console.error);
                updateUser({ profilePicture: uri });
            }
        } finally {
            setIsPickingAvatar(false);
        }
    };

    const handleHeroPress = () => {
        if (isSelf) {
            navigation.navigate('HeroCanvas', {
                initialData: heroData || { text: '', themeId: 't1' },
            });
        }
    };

    const handleAvatarPress = () => {
        Animated.sequence([
            Animated.spring(avatarScale, { toValue: 0.88, useNativeDriver: true, speed: 80 }),
            Animated.spring(avatarScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 10 }),
        ]).start(() => setImgViewerVisible(true));
    };

    const handleSocialPress = (platform: SocialPlatform) => {
        const url = socialUrls[platform];
        if (url && !isSelf) {
            Linking.openURL(url).catch(() => {});
        } else if (isSelf) {
            setActiveSocialPlatform(platform);
            setSocialInputUrl(url || '');
            setSocialDialogVisible(true);
        }
    };

    const handleSaveSocial = () => {
        if (activeSocialPlatform) {
            const newUrls = { ...socialUrls, [activeSocialPlatform]: socialInputUrl };
            setSocialUrls(newUrls);
            updateProfile({ socialUrls: newUrls }).catch(console.error);
        }
        setSocialDialogVisible(false);
    };

    const handleBlurName = () => {
        updateProfile({ Firstname: editName }).catch(console.error);
        updateUser({ Firstname: editName });
    };
    const handleBlurBio = () => {
        updateProfile({ bio: editBio }).catch(console.error);
        updateUser({ bio: editBio });
    };


    return (
        <SafeAreaView style={S.safe} edges={isSettingsTab ? ['top', 'left', 'right'] : ['top', 'left', 'right']}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />
            <Animated.View style={[S.root, { opacity: screenOpacity, transform: [{ scale: screenScale }] }]}>
                
                {/* ── Header ── */}
                <View style={[S.header, isSettingsTab && { justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center', paddingRight: 20 }]}>
                    {!isSettingsTab ? (
                        <RippleButton onPress={handleBack} borderless style={S.backBtn} rippleColor="rgba(0,0,0,0.2)">
                            <Ionicons name="arrow-back" size={26} color={INK} />
                        </RippleButton>
                    ) : (
                        <Text style={S.settingsTitle}>My Profile</Text>
                    )}

                    {isSettingsTab && (
                        <RippleButton onPress={Logout} borderless style={S.logoutBtn} rippleColor="rgba(239,68,68,0.15)">
                            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
                        </RippleButton>
                    )}
                </View>

                <ScrollView
                    style={S.scroll}
                    contentContainerStyle={[S.scrollContent, { paddingBottom: Math.max(insets.bottom + 32, 48) }]}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Top Profile Row ── */}
                    <View style={S.topRow}>
                        <View style={S.avatarCol}>
                            <RippleButton onPress={handleAvatarPress} borderless style={S.avatarBtn} rippleColor="rgba(0,0,0,0.2)">
                                <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
                                    {localPeerAvatar ? (
                                        <ExpoImage source={{ uri: localPeerAvatar }} style={S.avatar} contentFit="cover" />
                                    ) : (
                                        <View style={S.avatarFallback}></View>
                                    )}
                                    {isSelf && (
                                        <RippleButton onPress={handlePickAvatar} style={S.avatarEditBadge} borderless>
                                            <Ionicons name="camera" size={16} color={WHITE} />
                                        </RippleButton>
                                    )}
                                </Animated.View>
                            </RippleButton>
                            <Text style={S.handle} numberOfLines={1}>{peerUsername.toLowerCase()}</Text>
                        </View>
                        
                        <View style={S.infoCol}>
                            {isSelf ? (
                                <>
                                    <TextInput
                                        style={S.fullNameInput}
                                        value={editName}
                                        onChangeText={setEditName}
                                        onBlur={handleBlurName}
                                        placeholder="FULL NAME"
                                        placeholderTextColor={INK_MUTED}
                                    />
                                    <TextInput
                                        style={S.bioInput}
                                        value={editBio}
                                        onChangeText={setEditBio}
                                        onBlur={handleBlurBio}
                                        placeholder="Bio of the user"
                                        placeholderTextColor={INK_MUTED}
                                        multiline
                                    />
                                </>
                            ) : (
                                <>
                                    <Text style={S.fullName} numberOfLines={2}>{editName}</Text>
                                    <Text style={S.bio} numberOfLines={3}>{editBio}</Text>
                                </>
                            )}
                        </View>
                    </View>

                    {/* ── Action Buttons ── */}
                    {/* Hide the action buttons completely in Settings/Editor mode since you can't Follow or message yourself */}
                    {!isSettingsTab && (
                        <View style={S.actionsRow}>
                            <RippleButton
                                onPress={handleToggleFollow}
                                style={[S.actionBtn, isSelf && S.actionBtnDisabled]}
                                disabled={isSelf || followLoading}
                                rippleColor="rgba(255,255,255,0.2)"
                            >
                                <Text style={S.actionBtnText}>{isFollowing ? 'Following' : 'Follow Request'}</Text>
                            </RippleButton>

                            <RippleButton style={S.actionBtn} rippleColor="rgba(255,255,255,0.2)">
                                <Text style={S.actionBtnText}>Portfolio</Text>
                            </RippleButton>

                            <RippleButton style={S.actionBtn} rippleColor="rgba(255,255,255,0.2)">
                                <Text style={S.actionBtnText}>Share</Text>
                            </RippleButton>
                        </View>
                    )}

                    {/* ── Hero Description Card ── */}
                    {(!heroData || (!heroData.text && !heroData.customImageUri)) && !isSelf ? null : (
                        <RippleButton
                            onPress={handleHeroPress}
                            disabled={!isSelf}
                            style={[
                                S.heroCard,
                                (!heroData || (!heroData.text && !heroData.customImageUri))
                                    ? S.heroCardEmpty
                                    : { backgroundColor: heroData.themeId === 't4' ? GREEN_GRAD : '#6733d0' },
                                (heroData && heroExpanded) && S.heroCardExpanded
                            ]}
                            rippleColor="rgba(255,255,255,0.3)"
                        >
                            {(heroData && heroData.customImageUri) && (
                                <>
                                    <ExpoImage source={{ uri: heroData.customImageUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
                                </>
                            )}

                            {(!heroData || (!heroData.text && !heroData.customImageUri)) ? (
                                <Text style={S.heroTextEmpty}>Tap to design your Hero Card</Text>
                            ) : (
                                <View style={S.heroTextContainer}>
                                    <Text
                                        style={[S.heroText, heroData.customImageUri ? { color: '#fff' } : null]}
                                        numberOfLines={heroExpanded ? undefined : 6}
                                        ellipsizeMode="tail"
                                    >
                                        {heroData.text}
                                    </Text>
                                    
                                    {!heroExpanded && heroData.text.length > 200 && (
                                        <RippleButton onPress={() => setHeroExpanded(true)} style={S.viewFullBtn}>
                                            <Text style={S.viewFullText}>View Full Here</Text>
                                        </RippleButton>
                                    )}
                                    {heroExpanded && (
                                        <RippleButton onPress={() => setHeroExpanded(false)} style={S.viewFullBtn}>
                                            <Text style={S.viewFullText}>Show Less</Text>
                                        </RippleButton>
                                    )}
                                </View>
                            )}

                            {isSelf && (
                                <View style={S.editBadge}>
                                    <Ionicons name={heroData ? "pencil" : "add"} size={14} color="#000" />
                                </View>
                            )}
                        </RippleButton>
                    )}

                    {/* ── Circular Social Links ── */}
                    <View style={S.socialRow}>
                        {(['whatsapp', 'instagram', 'linkedin', 'twitter'] as SocialPlatform[]).map(plat => (
                            <SocialCircle
                                key={plat}
                                platform={plat}
                                url={socialUrls[plat]}
                                isSelf={isSelf}
                                onPress={() => handleSocialPress(plat)}
                            />
                        ))}
                    </View>

                    {/* ── Custom Links Component ── */}
                    {(!isSelf && links.length === 0) ? null : (
                        <View style={S.linksSection}>
                            <AddLink
                                initialLinks={links}
                                onChange={(newLinks) => {
                                    setLinks(newLinks);
                                    updateProfile({ customLinks: newLinks }).catch(console.error);
                                }}
                                maxLinks={8}
                                sectionTitle="Additional Links"
                                readonly={!isSelf}
                            />
                        </View>
                    )}

                </ScrollView>
            </Animated.View>

            {/* ── Fullscreen Avatar Viewer ── */}
            <Modal visible={imgViewerVisible} transparent animationType="fade" onRequestClose={() => setImgViewerVisible(false)}>
                <View style={S.imgViewerBackdrop}>
                    <RippleButton onPress={() => setImgViewerVisible(false)} style={S.imgViewerCloseBtn} borderless>
                        <Ionicons name="close" size={32} color={WHITE} />
                    </RippleButton>
                    {localPeerAvatar ? (
                        <ExpoImage source={{ uri: localPeerAvatar }} style={S.imgViewerImage} contentFit="contain" />
                    ) : (
                        <View style={S.imgViewerPlaceholder}>
                            <Text style={S.imgViewerPlaceholderText}>{peerUsername.slice(0, 1).toUpperCase()}</Text>
                        </View>
                    )}
                </View>
            </Modal>

            {/* ── Social Link Edit Dialog ── */}
            <Modal visible={socialDialogVisible} transparent animationType="fade" onRequestClose={() => setSocialDialogVisible(false)}>
                <KeyboardAvoidingView style={S.dialogBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={S.dialogCard}>
                        <Text style={S.dialogTitle}>Set {activeSocialPlatform} Link</Text>
                        <TextInput
                            style={S.dialogInput}
                            value={socialInputUrl}
                            onChangeText={setSocialInputUrl}
                            placeholder={`https://${activeSocialPlatform}.com/...`}
                            autoCapitalize="none"
                            keyboardType="url"
                            autoCorrect={false}
                        />
                        <View style={S.dialogActions}>
                            <RippleButton onPress={() => setSocialDialogVisible(false)} style={S.dialogBtn}>
                                <Text style={S.dialogBtnCancelText}>Cancel</Text>
                            </RippleButton>
                            <RippleButton onPress={handleSaveSocial} style={S.dialogBtnActive}>
                                <Text style={S.dialogBtnSaveText}>Save</Text>
                            </RippleButton>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

        </SafeAreaView>
    );
};

/* ─── Styles ─── */
const S = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: WHITE,
    },
    root: {
        flex: 1,
        backgroundColor: WHITE,
    },
    header: {
        height: 56,
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    settingsTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: INK,
        marginLeft: 8,
    },
    logoutBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff5f5'
    },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 12, gap: 24 },

    /* Top Row */
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 24,
    },
    avatarCol: {
        alignItems: 'center',
        gap: 8, // tightly aligned Handle underneath
        width: 120, // fixed width block for perfect alignment of the right col
    },
    avatarBtn: {
        borderRadius: 60,
    },
    avatar: {
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: '#7bc5b4', // Matches mockup avatar color
    },
    avatarFallback: {
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: '#7bc5b4',
    },
    avatarEditBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: NAVY,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    handle: {
        fontSize: 14,
        color: INK,
        fontWeight: '500',
    },
    infoCol: {
        flex: 1,
        justifyContent: 'center',
        gap: 6, // tightly aligned Name and Bio
    },
    fullName: {
        fontSize: 24,
        fontWeight: '400',
        color: INK,
        letterSpacing: 0.5,
    },
    fullNameInput: {
        fontSize: 24,
        fontWeight: '400',
        color: INK,
        letterSpacing: 0.5,
        padding: 0,
        margin: 0,
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        paddingBottom: 2,
    },
    bio: {
        fontSize: 15,
        color: INK,
        lineHeight: 22,
    },
    bioInput: {
        fontSize: 15,
        color: INK,
        lineHeight: 22,
        padding: 0,
        margin: 0,
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        paddingBottom: 2,
    },

    /* Action Strip */
    actionsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    actionBtn: {
        flex: 1,
        backgroundColor: NAVY,
        paddingVertical: 10,
        borderRadius: 8, // slight rounding like mockup
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnDisabled: {
        opacity: 0.6,
    },
    actionBtnText: {
        color: WHITE,
        fontSize: 12,
        fontWeight: '500',
    },

    /* Hero Card */
    heroCard: {
        marginHorizontal: 16,
        borderRadius: 20,
        minHeight: 180,
        maxHeight: 280, // auto crop height unless expanded
        padding: 24,
        justifyContent: 'center',
        overflow: 'hidden',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 10 },
            android: { elevation: 4 },
        }),
    },
    heroCardExpanded: {
        maxHeight: 1000,
    },
    heroCardEmpty: {
        backgroundColor: '#f5f5f5',
        borderWidth: 2,
        borderColor: '#d1d1d1',
        borderStyle: 'dashed',
        alignItems: 'center',
    },
    heroTextContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    heroText: {
        color: WHITE,
        fontSize: 18,
        textAlign: 'center',
        lineHeight: 26,
    },
    heroTextEmpty: {
        color: '#999',
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
    },
    viewFullBtn: {
        marginTop: 12,
        alignSelf: 'center',
        paddingVertical: 6,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(0,0,0,0.25)',
        borderRadius: 16,
    },
    viewFullText: {
        color: WHITE,
        fontSize: 13,
        fontWeight: '600',
    },
    editBadge: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    /* Social Circles */
    socialRow: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
    },
    socialCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: INK,
    },
    socialCircleEmpty: {
        backgroundColor: CIRCLE_BG,
        borderColor: '#bbb',
    },
    socialCircleActive: {
        backgroundColor: NAVY,
        borderColor: NAVY,
    },

    /* Links Section */
    linksSection: {
        marginTop: 8,
        backgroundColor: '#f5f5f5',
        padding: 16,
        borderRadius: 12,
    },

    /* Image Viewer */
    imgViewerBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imgViewerCloseBtn: {
        position: 'absolute',
        top: 60,
        right: 20,
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    imgViewerImage: {
        width: W,
        height: W,
    },
    imgViewerPlaceholder: {
        width: W,
        height: W,
        backgroundColor: '#7bc5b4',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imgViewerPlaceholderText: {
        fontSize: 120,
        color: WHITE,
        fontWeight: '800',
    },

    /* Dialog */
    dialogBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    dialogCard: {
        width: W * 0.85,
        backgroundColor: WHITE,
        borderRadius: 20,
        padding: 24,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10 },
            android: { elevation: 8 }
        }),
    },
    dialogTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: INK,
        marginBottom: 16,
        textTransform: 'capitalize',
    },
    dialogInput: {
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        color: INK,
        marginBottom: 20,
    },
    dialogActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    dialogBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
    },
    dialogBtnActive: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        backgroundColor: NAVY,
    },
    dialogBtnCancelText: { fontSize: 15, fontWeight: '600', color: INK_MUTED },
    dialogBtnSaveText: { fontSize: 15, fontWeight: '600', color: WHITE },
});

export default FullProfile;