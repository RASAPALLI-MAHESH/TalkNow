/**
 * fullProfile.tsx: a person's profile, and the Settings tab for your own.
 *
 * Layout (requested by the product owner, kept as designed):
 * - Top row: avatar + @username (left) | full name + bio (right)
 * - Actions: relationship button + more (other people only)
 * - Hero card: themed text or photo; your own opens the HeroCanvas editor
 * - Social circles: WhatsApp, Instagram, LinkedIn, Twitter
 * - Additional links (AddLink)
 * - Settings tab only: Account (blocked accounts, policies, log out, delete account)
 */

import AddLink, { type LinkEntry } from '@/app/components/AddLink';
import DeleteAccountModal from '@/app/components/DeleteAccountModal';
import { useSafetyActions } from '@/app/components/SafetyActions';
import {
    BottomSheet,
    Button,
    EmptyState,
    IconButton,
    ListRow,
    ListSection,
    NavBar,
    PressableScale,
    TextField,
    useNavBarHeight,
    useScrollEdge,
    useTabBarClearance,
} from '@/app/components/ui';
import useAuth from '@/hooks/useAuth';
import { getAuthErrorMessage, getUserProfile, updateProfile } from '@/services/AuthService';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/services/config';
import {
    isPrimaryRelationshipAction,
    performRelationshipAction,
    relationshipLabel,
    toRelationship,
    type Relationship,
} from '@/services/relationships';
import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { heroThemeFor, type HeroData } from './HeroCanvas';

/* ─── Social Links ─── */
type SocialPlatform = 'whatsapp' | 'instagram' | 'linkedin' | 'twitter';
const SOCIAL_ICONS: Record<SocialPlatform, keyof typeof Ionicons.glyphMap> = {
    whatsapp: 'logo-whatsapp',
    instagram: 'logo-instagram',
    linkedin: 'logo-linkedin',
    twitter: 'logo-twitter',
};
const SOCIAL_NAMES: Record<SocialPlatform, string> = {
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    twitter: 'Twitter',
};

// Saved social links must open as web links; a bare "instagram.com/me" gets https://.
const normalizeSocialUrl = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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
    const s = useStyles();
    const { colors } = useTheme();
    // Other people's empty links are hidden.
    if (!isSelf && !url) return null;
    const hasUrl = !!url;
    const name = SOCIAL_NAMES[platform];

    return (
        <PressableScale
            onPress={onPress}
            scaleTo={0.92}
            style={[s.socialCircle, hasUrl ? s.socialCircleActive : s.socialCircleEmpty]}
            accessibilityRole={hasUrl && !isSelf ? 'link' : 'button'}
            accessibilityLabel={isSelf ? (hasUrl ? `Edit ${name} link` : `Add ${name} link`) : `Open ${name}`}
        >
            <Ionicons name={SOCIAL_ICONS[platform]} size={26} color={hasUrl ? colors.onTint : colors.tertiaryLabel} />
        </PressableScale>
    );
};

/* ─── Hero card ─── */
export const HeroCard = ({
    heroData,
    isSelf,
    onEdit,
}: {
    heroData: HeroData | null;
    isSelf: boolean;
    onEdit: () => void;
}) => {
    const s = useStyles();
    const { colors } = useTheme();
    const [expanded, setExpanded] = useState(false);
    const empty = !heroData || (!heroData.text && !heroData.customImageUri);
    if (empty && !isSelf) return null;

    if (empty) {
        return (
            <PressableScale onPress={onEdit} style={s.heroEmpty} accessibilityRole="button" accessibilityLabel="Design your Hero Card">
                <Ionicons name="color-wand-outline" size={26} color={colors.tintText} />
                <Text style={s.heroEmptyText}>Tap to design your Hero Card</Text>
            </PressableScale>
        );
    }

    const theme = heroThemeFor(heroData!.themeId);
    const textColor = heroData!.customImageUri ? '#ffffff' : theme.textColor;
    const long = heroData!.text.length > 200;

    return (
        <Pressable
            onPress={isSelf ? onEdit : undefined}
            disabled={!isSelf}
            style={[s.heroCard, expanded && s.heroCardExpanded]}
            accessibilityRole={isSelf ? 'button' : 'text'}
            accessibilityLabel={isSelf ? `Hero card: ${heroData!.text}. Double tap to edit` : heroData!.text}
        >
            {heroData!.customImageUri ? (
                <>
                    <ExpoImage source={{ uri: heroData!.customImageUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.42)' }]} />
                </>
            ) : (
                <LinearGradient colors={theme.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            )}

            <Text style={[s.heroText, { color: textColor }]} numberOfLines={expanded ? undefined : 6} ellipsizeMode="tail">
                {heroData!.text}
            </Text>

            {long && (
                <PressableScale onPress={() => setExpanded((v) => !v)} style={s.heroMore} accessibilityRole="button">
                    <Text style={s.heroMoreText}>{expanded ? 'Show Less' : 'View Full Here'}</Text>
                </PressableScale>
            )}

            {isSelf && (
                <View style={s.heroEditBadge} accessibilityElementsHidden>
                    <Ionicons name="pencil" size={14} color="#ffffff" />
                </View>
            )}
        </Pressable>
    );
};

/* ─── FullProfile Screen ─── */
type FullProfileProps = {
    navigation?: any;
    route?: any;
    isSettingsTab?: boolean;
};

const LARGE_TITLE_HEIGHT = 52;

const FullProfile = ({ navigation, route, isSettingsTab }: FullProfileProps) => {
    const s = useStyles();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const navHeight = useNavBarHeight();
    const tabClearance = useTabBarClearance();
    const { width } = useWindowDimensions();
    const { scrollY, onScroll } = useScrollEdge();
    const { user: me, Logout, updateUser, signOutLocally } = useAuth();

    // If it's the settings tab, we are viewing our OWN profile.
    const peerId       = isSettingsTab ? String(me?.id ?? '') : String(route?.params?.peerId ?? '').trim();
    const peerUsername = isSettingsTab ? String(me?.username ?? 'Unknown') : String(route?.params?.peerUsername ?? 'Unknown').trim() || 'Unknown';
    const peerAvatar   = isSettingsTab ? String(me?.profilePicture ?? '') : route?.params?.peerAvatar || '';

    const isSelf = isSettingsTab || me?.id === peerId;

    /* State */
    const [relationship, setRelationship] = useState<Relationship>('none');
    const [followLoading, setFollowLoading] = useState(false);
    // The server answers 404 for deleted accounts and for people who blocked you.
    const [unavailable, setUnavailable] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [deleteVisible, setDeleteVisible] = useState(false);

    const { openSafetyMenu, safetySheet } = useSafetyActions({
        userId: peerId,
        username: peerUsername,
        blocked: relationship === 'blocked',
        onBlockedChange: (blocked) => setRelationship(blocked ? 'blocked' : 'none'),
    });
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

    // Editable text, plus the last saved values so a blur without changes saves nothing.
    const [editName, setEditName] = useState('');
    const [editBio, setEditBio] = useState('');
    const savedNameRef = useRef('');
    const savedBioRef = useRef('');

    // Modals
    const [imgViewerVisible, setImgViewerVisible] = useState(false);
    const [socialDialogVisible, setSocialDialogVisible] = useState(false);
    const [activeSocialPlatform, setActiveSocialPlatform] = useState<SocialPlatform | null>(null);
    const [socialInputUrl, setSocialInputUrl] = useState('');

    // Hero Data — null means user hasn't configured it yet
    const [heroData, setHeroData] = useState<HeroData | null>(null);

    /* Fetch Profile Data on Mount */
    useEffect(() => {
        if (!peerId) return;
        getUserProfile(peerId).then(data => {
            setRelationship(toRelationship(data.relationship));
            savedNameRef.current = String(data.Firstname ?? '');
            savedBioRef.current = String(data.bio ?? '');
            setEditName(savedNameRef.current);
            setEditBio(savedBioRef.current);
            if (data.profilePicture) setLocalPeerAvatar(data.profilePicture);
            if (data.heroData) setHeroData(data.heroData);
            if (data.socialUrls) setSocialUrls(data.socialUrls);
            if (data.customLinks) setLinks(data.customLinks);
        }).catch((err) => {
            if (err?.response?.status === 404) setUnavailable(true);
            else console.error(err);
        }).finally(() => setLoaded(true));
    }, [peerId]);

    /* HeroCanvas saves own edits and updates the signed-in user; show them here. */
    const myHeroData = me?.heroData as HeroData | undefined;
    useEffect(() => {
        if (isSelf && myHeroData) setHeroData(myHeroData);
    }, [isSelf, myHeroData]);

    const handleToggleFollow = async () => {
        if (!peerId || followLoading) return;
        setFollowLoading(true);
        try {
            setRelationship(await performRelationshipAction(peerId, peerUsername, relationship));
        } catch (err) {
            Alert.alert('Something went wrong', getAuthErrorMessage(err, 'Please try again.'));
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
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.6,
                base64: true,
            });
            const asset = result.canceled ? undefined : result.assets?.[0];
            if (asset?.base64) {
                // Send the image itself: a local file path can't be seen by other users.
                const uri = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
                const previous = localPeerAvatar;
                setLocalPeerAvatar(uri);
                try {
                    const response = await updateProfile({ profilePicture: uri });
                    // Use the stored image URL the server returns.
                    const saved = String(response?.user?.profilePicture ?? uri);
                    setLocalPeerAvatar(saved);
                    updateUser({ profilePicture: saved });
                } catch (err) {
                    setLocalPeerAvatar(previous);
                    Alert.alert('Could not update photo', getAuthErrorMessage(err, 'Please try again.'));
                }
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

    const handleSocialPress = (platform: SocialPlatform) => {
        const url = socialUrls[platform];
        if (url && !isSelf) {
            // Only open web links, whatever the profile data says.
            if (/^https?:\/\//i.test(url)) Linking.openURL(url).catch(() => {});
        } else if (isSelf) {
            setActiveSocialPlatform(platform);
            setSocialInputUrl(url || '');
            setSocialDialogVisible(true);
        }
    };

    const handleSaveSocial = () => {
        if (activeSocialPlatform) {
            const newUrls = { ...socialUrls, [activeSocialPlatform]: normalizeSocialUrl(socialInputUrl) };
            setSocialUrls(newUrls);
            updateProfile({ socialUrls: newUrls }).catch(console.error);
        }
        setSocialDialogVisible(false);
    };

    const handleBlurName = () => {
        const name = editName.trim();
        if (!name || name === savedNameRef.current) return;
        savedNameRef.current = name;
        updateProfile({ Firstname: name }).catch(console.error);
        updateUser({ Firstname: name });
    };
    const handleBlurBio = () => {
        const bio = editBio.trim();
        if (bio === savedBioRef.current) return;
        savedBioRef.current = bio;
        updateProfile({ bio }).catch(console.error);
        updateUser({ bio });
    };

    const confirmLogout = () => {
        Alert.alert('Log out?', 'You can log back in with your username and password.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: () => void Logout() },
        ]);
    };

    if (unavailable) {
        return (
            <View style={s.screen}>
                <View style={[s.unavailable, { paddingTop: navHeight }]}>
                    <EmptyState icon="person-remove-outline" title="This account isn't available." />
                </View>
                <NavBar onBack={() => navigation.goBack()} />
            </View>
        );
    }

    const relationshipKey: Relationship | 'self' = isSelf ? 'self' : relationship;
    const primaryAction = !isSelf && isPrimaryRelationshipAction(relationship);
    const socialPlatforms = (['whatsapp', 'instagram', 'linkedin', 'twitter'] as SocialPlatform[]).filter(
        (p) => isSelf || !!socialUrls[p]
    );

    return (
        <View style={s.screen}>
            <Animated.ScrollView
                onScroll={onScroll}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                    s.content,
                    {
                        paddingTop: navHeight + (isSettingsTab ? -8 : 8),
                        paddingBottom: isSettingsTab ? tabClearance : Math.max(insets.bottom, 16) + 32,
                    },
                ]}
            >
                {isSettingsTab && (
                    <View style={s.largeTitleRow}>
                        <Text style={s.largeTitle} accessibilityRole="header">
                            My Profile
                        </Text>
                    </View>
                )}

                {/* ── Top row: avatar + handle | name + bio ── */}
                <View style={s.topRow}>
                    <View style={s.avatarCol}>
                        <Pressable
                            onPress={() => setImgViewerVisible(true)}
                            style={s.avatarBtn}
                            accessibilityRole="imagebutton"
                            accessibilityLabel={`View ${peerUsername}'s photo`}
                        >
                            {localPeerAvatar ? (
                                <ExpoImage source={{ uri: localPeerAvatar }} style={s.avatar} contentFit="cover" />
                            ) : (
                                <View style={[s.avatar, s.avatarFallback]}>
                                    <Text style={s.avatarInitial}>{peerUsername.slice(0, 1).toUpperCase()}</Text>
                                </View>
                            )}
                        </Pressable>
                        {isSelf && (
                            <PressableScale
                                onPress={handlePickAvatar}
                                style={s.avatarEditBadge}
                                accessibilityRole="button"
                                accessibilityLabel="Change profile photo"
                                hitSlop={8}
                            >
                                {isPickingAvatar ? (
                                    <ActivityIndicator size="small" color={colors.onTint} />
                                ) : (
                                    <Ionicons name="camera" size={15} color={colors.onTint} />
                                )}
                            </PressableScale>
                        )}
                        <Text style={s.handle} numberOfLines={1}>@{peerUsername.toLowerCase()}</Text>
                    </View>

                    <View style={s.infoCol}>
                        {isSelf ? (
                            <>
                                <TextInput
                                    style={[s.fullName, s.inlineInput]}
                                    value={editName}
                                    onChangeText={setEditName}
                                    onBlur={handleBlurName}
                                    placeholder="FULL NAME"
                                    placeholderTextColor={colors.placeholder}
                                    selectionColor={colors.tintText}
                                    accessibilityLabel="Full name"
                                />
                                <TextInput
                                    style={[s.bio, s.inlineInput]}
                                    value={editBio}
                                    onChangeText={setEditBio}
                                    onBlur={handleBlurBio}
                                    placeholder="Bio of the user"
                                    placeholderTextColor={colors.placeholder}
                                    selectionColor={colors.tintText}
                                    multiline
                                    accessibilityLabel="Bio"
                                />
                            </>
                        ) : (
                            <>
                                <Text style={s.fullName} numberOfLines={2}>{editName || peerUsername.toUpperCase()}</Text>
                                {!!editBio && <Text style={s.bio} numberOfLines={4}>{editBio}</Text>}
                            </>
                        )}
                    </View>
                </View>

                {/* ── Actions (other people) ── */}
                {!isSettingsTab && (
                    <View style={s.actionsRow}>
                        <Button
                            title={relationshipLabel[relationshipKey]}
                            onPress={handleToggleFollow}
                            disabled={isSelf}
                            loading={followLoading}
                            variant={primaryAction ? 'filled' : 'tinted'}
                            size="md"
                            style={s.actionBtn}
                        />
                        {!isSelf && (
                            <IconButton
                                name="ellipsis-horizontal"
                                variant="tinted"
                                onPress={openSafetyMenu}
                                accessibilityLabel="More options"
                            />
                        )}
                    </View>
                )}

                {/* ── Hero Description Card ── */}
                <HeroCard heroData={heroData} isSelf={!!isSelf} onEdit={handleHeroPress} />

                {/* ── Social links ── */}
                {socialPlatforms.length > 0 && (
                    <View style={s.socialRow}>
                        {socialPlatforms.map(plat => (
                            <SocialCircle
                                key={plat}
                                platform={plat}
                                url={socialUrls[plat]}
                                isSelf={!!isSelf}
                                onPress={() => handleSocialPress(plat)}
                            />
                        ))}
                    </View>
                )}

                {/* ── Custom Links ── (rendered once the profile has loaded, so saved links are never overwritten) */}
                {loaded && (isSelf || links.length > 0) && (
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
                )}

                {/* ── Account (own profile in Settings) ── */}
                {isSettingsTab && (
                    <ListSection title="Account">
                        <ListRow icon="hand-left-outline" title="Blocked accounts" onPress={() => navigation.navigate('BlockedUsers')} />
                        {!!PRIVACY_POLICY_URL && (
                            <ListRow icon="shield-checkmark-outline" title="Privacy policy" accessory="external" onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})} />
                        )}
                        {!!TERMS_URL && (
                            <ListRow icon="document-text-outline" title="Terms of use" accessory="external" onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} />
                        )}
                        <ListRow icon="log-out-outline" title="Log out" accessory="none" onPress={confirmLogout} testID="settings-logout" />
                        <ListRow icon="trash-outline" title="Delete account" destructive accessory="none" onPress={() => setDeleteVisible(true)} />
                    </ListSection>
                )}
            </Animated.ScrollView>

            <NavBar
                title={isSettingsTab ? 'My Profile' : peerUsername}
                onBack={isSettingsTab ? undefined : () => navigation.goBack()}
                scrollY={scrollY}
                titleRevealAt={isSettingsTab ? LARGE_TITLE_HEIGHT - 4 : 120}
            />

            {safetySheet}
            <DeleteAccountModal
                visible={deleteVisible}
                onClose={() => setDeleteVisible(false)}
                onDeleted={() => {
                    setDeleteVisible(false);
                    signOutLocally();
                }}
            />

            {/* ── Fullscreen Avatar Viewer ── */}
            <Modal visible={imgViewerVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setImgViewerVisible(false)}>
                <View style={s.imgViewerBackdrop}>
                    {localPeerAvatar ? (
                        <ExpoImage source={{ uri: localPeerAvatar }} style={{ width, height: width }} contentFit="contain" />
                    ) : (
                        <View style={[s.imgViewerPlaceholder, { width, height: width }]}>
                            <Text style={s.imgViewerPlaceholderText}>{peerUsername.slice(0, 1).toUpperCase()}</Text>
                        </View>
                    )}
                    <IconButton
                        name="close"
                        variant="glass"
                        color="#ffffff"
                        onPress={() => setImgViewerVisible(false)}
                        accessibilityLabel="Close photo"
                        style={[s.imgViewerClose, { top: insets.top + 8 }]}
                    />
                </View>
            </Modal>

            {/* ── Social Link Edit Sheet ── */}
            <BottomSheet
                visible={socialDialogVisible}
                onClose={() => setSocialDialogVisible(false)}
                title={activeSocialPlatform ? `${SOCIAL_NAMES[activeSocialPlatform]} link` : 'Link'}
                subtitle="Leave empty to remove it from your profile."
            >
                <View style={s.sheetBody}>
                    <TextField
                        icon={activeSocialPlatform ? SOCIAL_ICONS[activeSocialPlatform] : 'link-outline'}
                        value={socialInputUrl}
                        onChangeText={setSocialInputUrl}
                        placeholder={`https://${activeSocialPlatform ?? 'example'}.com/...`}
                        autoCapitalize="none"
                        keyboardType="url"
                        textContentType="URL"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={handleSaveSocial}
                        accessibilityLabel="Link address"
                    />
                    <View style={s.sheetButtons}>
                        <Button title="Cancel" variant="gray" onPress={() => setSocialDialogVisible(false)} style={s.flex1} />
                        <Button title="Save" onPress={handleSaveSocial} style={s.flex2} />
                    </View>
                </View>
            </BottomSheet>
        </View>
    );
};

/* ─── Styles ─── */
const useStyles = makeStyles((t) => ({
    screen: {
        flex: 1,
        backgroundColor: t.colors.ground,
    },
    content: {
        gap: t.space.xxl,
    },
    largeTitleRow: {
        height: LARGE_TITLE_HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: t.space.gutter,
        marginBottom: -t.space.sm,
    },
    largeTitle: {
        ...t.type.largeTitle,
        color: t.colors.label,
    },
    unavailable: {
        flex: 1,
        justifyContent: 'center',
    },

    /* Top Row */
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.xl,
        paddingHorizontal: t.space.gutter,
    },
    avatarCol: {
        alignItems: 'center',
        gap: t.space.sm,
        width: 112,
    },
    avatarBtn: {
        borderRadius: 52,
    },
    avatar: {
        width: 104,
        height: 104,
        borderRadius: 52,
        backgroundColor: t.colors.avatarFill,
    },
    avatarFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitial: {
        fontSize: 40,
        fontWeight: '700',
        color: t.colors.avatarInitial,
    },
    avatarEditBadge: {
        position: 'absolute',
        top: 74,
        right: 4,
        backgroundColor: t.colors.tint,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: t.colors.ground,
    },
    handle: {
        ...t.type.footnote,
        fontWeight: '600',
        color: t.colors.secondaryLabel,
        maxWidth: 112,
    },
    infoCol: {
        flex: 1,
        justifyContent: 'center',
        gap: t.space.sm,
    },
    fullName: {
        ...t.type.title2,
        color: t.colors.label,
    },
    bio: {
        ...t.type.subhead,
        lineHeight: 21,
        color: t.colors.secondaryLabel,
    },
    inlineInput: {
        padding: 0,
        margin: 0,
        paddingBottom: t.space.xs,
        borderBottomWidth: t.size.hairline,
        borderBottomColor: t.colors.separator,
    },

    /* Actions */
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.sm,
        paddingHorizontal: t.space.gutter,
        marginTop: -t.space.sm,
    },
    actionBtn: {
        flex: 1,
    },

    /* Hero Card */
    heroCard: {
        marginHorizontal: t.space.gutter,
        borderRadius: t.radius.xxl,
        minHeight: 180,
        maxHeight: 300,
        padding: t.space.xxl,
        justifyContent: 'center',
        overflow: 'hidden',
    },
    heroCardExpanded: {
        maxHeight: undefined,
    },
    heroText: {
        ...t.type.title3,
        fontWeight: '600',
        lineHeight: 27,
        textAlign: 'center',
    },
    heroMore: {
        marginTop: t.space.md,
        alignSelf: 'center',
        paddingVertical: 6,
        paddingHorizontal: t.space.lg,
        backgroundColor: 'rgba(0,0,0,0.28)',
        borderRadius: t.radius.pill,
    },
    heroMoreText: {
        ...t.type.footnote,
        fontWeight: '600',
        color: '#ffffff',
    },
    heroEditBadge: {
        position: 'absolute',
        top: t.space.md,
        right: t.space.md,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(0,0,0,0.28)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroEmpty: {
        marginHorizontal: t.space.gutter,
        minHeight: 140,
        borderRadius: t.radius.xxl,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: t.colors.fillStrong,
        backgroundColor: t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space.sm,
    },
    heroEmptyText: {
        ...t.type.subhead,
        fontWeight: '600',
        color: t.colors.tintText,
    },

    /* Social Circles */
    socialRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: t.space.xl,
        paddingHorizontal: t.space.gutter,
    },
    socialCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    socialCircleEmpty: {
        backgroundColor: t.colors.surface,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: t.colors.fillStrong,
    },
    socialCircleActive: {
        backgroundColor: t.colors.tint,
    },

    /* Image Viewer */
    imgViewerBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imgViewerClose: {
        position: 'absolute',
        right: t.space.lg,
    },
    imgViewerPlaceholder: {
        backgroundColor: t.colors.avatarFill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    imgViewerPlaceholderText: {
        fontSize: 120,
        color: t.colors.avatarInitial,
        fontWeight: '800',
    },

    /* Sheet */
    sheetBody: {
        gap: t.space.lg,
    },
    sheetButtons: {
        flexDirection: 'row',
        gap: t.space.md,
    },
    flex1: { flex: 1 },
    flex2: { flex: 2 },
}));

export default FullProfile;
