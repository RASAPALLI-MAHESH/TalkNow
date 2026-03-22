/**
 * AddLink.tsx — Reusable "Add Link" component
 *
 * Lets a user attach named hyperlinks to their profile (or any context).
 * Each entry has:
 *   - label  : display text  e.g. "My Portfolio"
 *   - url    : the full URL  e.g. "https://example.com"
 *
 * Features:
 *  - Animated modal sheet to add / edit a link
 *  - URL validation (must start with http:// or https://)
 *  - Inline list with edit + delete with swipe-hint reveal
 *  - Ripple press on each row (RippleButton)
 *  - Spring open/close animation on the modal
 *  - onChange(links) callback for parent integration
 *  - Fully self-contained — drop in anywhere
 *
 * Usage:
 *   <AddLink
 *       initialLinks={user.links}          // optional seed data
 *       onChange={(links) => save(links)}  // called on every add/edit/delete
 *       maxLinks={5}                       // default 5
 *   />
 */

import React, {
    memo,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import {
    Animated,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RippleButton from '@/app/components/RippleButton';

/* ─── Types ─── */
export type LinkEntry = {
    id: string;
    label: string;
    url: string;
};

type AddLinkProps = {
    initialLinks?: LinkEntry[];
    onChange?: (links: LinkEntry[]) => void;
    maxLinks?: number;
    /** Label above the section e.g. "Links" */
    sectionTitle?: string;
    readonly?: boolean;
};

/* ─── Tokens ─── */
const PURPLE       = '#6733d0';
const PURPLE_DARK  = '#4c1f9e';
const PURPLE_LIGHT = '#ede6ff';
const PURPLE_XLIGHT = '#f8f5ff';
const WHITE        = '#ffffff';
const INK          = '#1a1a2e';
const INK_MUTED    = '#7b7b9d';
const RED          = '#ef4444';
const GREEN        = '#22c55e';
const SEPARATOR    = 'rgba(103,51,208,0.08)';
const SHADOW       = 'rgba(103,51,208,0.13)';

const { height: SCREEN_H } = Dimensions.get('window');

/* ─── URL validator ─── */
const isValidUrl = (raw: string) => {
    try {
        const u = new URL(raw.trim());
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
};

const normalizeUrl = (raw: string): string => {
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
};

/* ─── Icon map for common domains ─── */
const domainIcon = (url: string): keyof typeof Ionicons.glyphMap => {
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (host.includes('github'))    return 'logo-github';
        if (host.includes('twitter') || host.includes('x.com')) return 'logo-twitter';
        if (host.includes('linkedin'))  return 'logo-linkedin';
        if (host.includes('instagram')) return 'logo-instagram';
        if (host.includes('youtube'))   return 'logo-youtube';
        if (host.includes('facebook'))  return 'logo-facebook';
        if (host.includes('discord'))   return 'logo-discord';
        if (host.includes('dribbble'))  return 'basketball-outline';
        if (host.includes('behance'))   return 'color-palette-outline';
    } catch {}
    return 'link-outline';
};

/* ─── Link row ─── */
const LinkRow = memo(({
    entry,
    onEdit,
    onDelete,
    readonly,
}: {
    entry: LinkEntry;
    onEdit: () => void;
    onDelete: () => void;
    readonly?: boolean;
}) => {
    const icon = domainIcon(entry.url);

    const handleOpen = () => {
        Linking.openURL(entry.url).catch(() => {});
    };

    return (
        <View style={rowStyles.container}>
            <RippleButton
                onPress={handleOpen}
                style={rowStyles.main}
                rippleColor="rgba(103,51,208,0.12)"
            >
                <View style={rowStyles.iconCircle}>
                    <Ionicons name={icon} size={18} color={PURPLE} />
                </View>
                <View style={rowStyles.textWrap}>
                    <Text style={rowStyles.label} numberOfLines={1}>{entry.label || 'Link'}</Text>
                    <Text style={rowStyles.url} numberOfLines={1}>{entry.url}</Text>
                </View>
                <Ionicons name="open-outline" size={14} color={INK_MUTED} />
            </RippleButton>

            {!readonly && (
                <>
                    {/* Edit */}
                    <RippleButton
                        onPress={onEdit}
                        borderless
                        style={rowStyles.action}
                        rippleColor="rgba(103,51,208,0.18)"
                        accessibilityLabel="Edit link"
                    >
                        <Ionicons name="pencil-outline" size={16} color={PURPLE} />
                    </RippleButton>

                    {/* Delete */}
                    <RippleButton
                        onPress={onDelete}
                        borderless
                        style={rowStyles.action}
                        rippleColor="rgba(239,68,68,0.18)"
                        accessibilityLabel="Delete link"
                    >
                        <Ionicons name="trash-outline" size={16} color={RED} />
                    </RippleButton>
                </>
            )}
        </View>
    );
});

const rowStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SEPARATOR,
    },
    main: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 13,
        paddingHorizontal: 16,
        gap: 12,
        overflow: 'hidden',
    },
    iconCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: PURPLE_LIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    textWrap: {
        flex: 1,
        minWidth: 0,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: INK,
    },
    url: {
        fontSize: 12,
        color: PURPLE,
        marginTop: 1,
    },
    action: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 2,
    },
});

/* ─── Modal sheet for add / edit ─── */
type SheetProps = {
    visible: boolean;
    editing: LinkEntry | null;
    onClose: () => void;
    onSave: (label: string, url: string) => void;
};

const AddEditSheet = memo(({ visible, editing, onClose, onSave }: SheetProps) => {
    const [label, setLabel] = useState('');
    const [url, setUrl]     = useState('');
    const [urlError, setUrlError] = useState('');

    const slideAnim  = useRef(new Animated.Value(SCREEN_H)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;

    /* Populate fields when editing */
    useEffect(() => {
        if (visible) {
            setLabel(editing?.label ?? '');
            setUrl(editing?.url ?? '');
            setUrlError('');
            // Animate in
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 72,
                    friction: 9,
                }),
                Animated.timing(backdropAnim, {
                    toValue: 1,
                    duration: 220,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: SCREEN_H,
                    useNativeDriver: true,
                    tension: 72,
                    friction: 9,
                }),
                Animated.timing(backdropAnim, {
                    toValue: 0,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible, editing]);

    const handleSave = () => {
        const normalized = normalizeUrl(url);
        if (!isValidUrl(normalized)) {
            setUrlError('Please enter a valid URL (e.g. https://example.com)');
            return;
        }
        setUrlError('');
        Keyboard.dismiss();
        onSave(label.trim() || normalized, normalized);
    };

    const handleClose = () => {
        Keyboard.dismiss();
        onClose();
    };

    const isNew = !editing;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
            <KeyboardAvoidingView
                style={sheetStyles.root}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Backdrop */}
                <Animated.View
                    style={[sheetStyles.backdrop, { opacity: backdropAnim }]}
                    pointerEvents="none"
                />
                <Pressable style={sheetStyles.backdropHit} onPress={handleClose} />

                {/* Sheet */}
                <Animated.View style={[sheetStyles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                    {/* Handle */}
                    <View style={sheetStyles.handle} />

                    {/* Title row */}
                    <View style={sheetStyles.titleRow}>
                        <Text style={sheetStyles.title}>{isNew ? 'Add Link' : 'Edit Link'}</Text>
                        <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel="Close">
                            <Ionicons name="close" size={22} color={INK_MUTED} />
                        </TouchableOpacity>
                    </View>

                    {/* Label field */}
                    <Text style={sheetStyles.fieldLabel}>Display Text <Text style={sheetStyles.optional}>(optional)</Text></Text>
                    <View style={sheetStyles.inputRow}>
                        <Ionicons name="text-outline" size={18} color={INK_MUTED} style={sheetStyles.inputIcon} />
                        <TextInput
                            style={sheetStyles.input}
                            placeholder="e.g. My Portfolio"
                            placeholderTextColor="rgba(103,51,208,0.35)"
                            value={label}
                            onChangeText={setLabel}
                            returnKeyType="next"
                            autoCapitalize="words"
                            maxLength={60}
                        />
                    </View>

                    {/* URL field */}
                    <Text style={[sheetStyles.fieldLabel, { marginTop: 14 }]}>URL <Text style={sheetStyles.required}>*</Text></Text>
                    <View style={[sheetStyles.inputRow, !!urlError && sheetStyles.inputRowError]}>
                        <Ionicons name="link-outline" size={18} color={urlError ? RED : INK_MUTED} style={sheetStyles.inputIcon} />
                        <TextInput
                            style={sheetStyles.input}
                            placeholder="https://example.com"
                            placeholderTextColor="rgba(103,51,208,0.35)"
                            value={url}
                            onChangeText={(t) => { setUrl(t); setUrlError(''); }}
                            returnKeyType="done"
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            maxLength={500}
                            onSubmitEditing={handleSave}
                        />
                        {isValidUrl(normalizeUrl(url)) && (
                            <Ionicons name="checkmark-circle" size={16} color={GREEN} style={{ marginRight: 6 }} />
                        )}
                    </View>
                    {!!urlError && <Text style={sheetStyles.errorText}>{urlError}</Text>}

                    {/* Save button */}
                    <TouchableOpacity
                        onPress={handleSave}
                        style={[sheetStyles.saveBtn, !url.trim() && sheetStyles.saveBtnDisabled]}
                        disabled={!url.trim()}
                        accessibilityRole="button"
                        accessibilityLabel={isNew ? 'Add link' : 'Save changes'}
                        activeOpacity={0.78}
                    >
                        <Ionicons name={isNew ? 'add-circle-outline' : 'save-outline'} size={18} color={WHITE} />
                        <Text style={sheetStyles.saveBtnText}>{isNew ? 'Add Link' : 'Save Changes'}</Text>
                    </TouchableOpacity>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
});

const sheetStyles = StyleSheet.create({
    root: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.52)',
    },
    backdropHit: {
        ...StyleSheet.absoluteFillObject,
    },
    sheet: {
        backgroundColor: WHITE,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingBottom: 36,
        paddingTop: 12,
        ...Platform.select({
            ios: {
                shadowColor: SHADOW,
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 1,
                shadowRadius: 20,
            },
            android: { elevation: 20 },
        }),
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(103,51,208,0.18)',
        marginBottom: 16,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    title: {
        fontSize: 18,
        fontWeight: '800',
        color: INK,
    },
    fieldLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: INK_MUTED,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    optional: {
        color: INK_MUTED,
        fontWeight: '400',
        textTransform: 'none',
        letterSpacing: 0,
    },
    required: {
        color: RED,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: PURPLE_XLIGHT,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: PURPLE_LIGHT,
        paddingHorizontal: 12,
        minHeight: 48,
    },
    inputRowError: {
        borderColor: RED,
        backgroundColor: '#fff5f5',
    },
    inputIcon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        fontSize: 15,
        color: INK,
        paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    },
    errorText: {
        fontSize: 12,
        color: RED,
        fontWeight: '600',
        marginTop: 5,
        marginLeft: 4,
    },
    saveBtn: {
        marginTop: 24,
        backgroundColor: PURPLE,
        borderRadius: 16,
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...Platform.select({
            ios: {
                shadowColor: PURPLE_DARK,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 10,
            },
            android: { elevation: 4 },
        }),
    },
    saveBtnDisabled: {
        opacity: 0.45,
    },
    saveBtnText: {
        color: WHITE,
        fontSize: 15,
        fontWeight: '800',
    },
});

/* ─── Main AddLink component ─── */
const AddLink = ({
    initialLinks = [],
    onChange,
    maxLinks = 5,
    sectionTitle = 'Links',
    readonly = false,
}: AddLinkProps) => {
    const [links, setLinks] = useState<LinkEntry[]>(initialLinks);
    const [sheetVisible, setSheetVisible] = useState(false);
    const [editingEntry, setEditingEntry] = useState<LinkEntry | null>(null);

    /* Notify parent on every mutation */
    const updateLinks = useCallback((next: LinkEntry[]) => {
        setLinks(next);
        onChange?.(next);
    }, [onChange]);

    const openAdd = () => {
        setEditingEntry(null);
        setSheetVisible(true);
    };

    const openEdit = (entry: LinkEntry) => {
        setEditingEntry(entry);
        setSheetVisible(true);
    };

    const handleDelete = (id: string) => {
        updateLinks(links.filter(l => l.id !== id));
    };

    const handleSave = (label: string, url: string) => {
        if (editingEntry) {
            // Edit existing
            updateLinks(links.map(l =>
                l.id === editingEntry.id ? { ...l, label, url } : l
            ));
        } else {
            // Add new
            const newEntry: LinkEntry = {
                id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                label,
                url,
            };
            updateLinks([...links, newEntry]);
        }
        setSheetVisible(false);
        setEditingEntry(null);
    };

    const atMax = links.length >= maxLinks;

    if (readonly && links.length === 0) {
        return null;
    }

    return (
        <View style={mainStyles.wrapper}>
            {/* Section header */}
            <View style={mainStyles.sectionHeader}>
                <View style={mainStyles.sectionTitleRow}>
                    <Ionicons name="link" size={16} color={PURPLE} />
                    <Text style={mainStyles.sectionTitle}>{sectionTitle}</Text>
                    {(!readonly) && (
                        <Text style={mainStyles.sectionCount}>{links.length}/{maxLinks}</Text>
                    )}
                </View>

                {!atMax && !readonly && (
                    <RippleButton
                        onPress={openAdd}
                        borderless
                        style={mainStyles.addBtn}
                        rippleColor="rgba(103,51,208,0.22)"
                        accessibilityLabel="Add link"
                    >
                        <Ionicons name="add-circle" size={22} color={PURPLE} />
                    </RippleButton>
                )}
            </View>

            {/* Links list */}
            {links.length > 0 ? (
                <View style={mainStyles.card}>
                    {links.map((entry) => (
                        <LinkRow
                            key={entry.id}
                            entry={entry}
                            onEdit={() => openEdit(entry)}
                            onDelete={() => handleDelete(entry.id)}
                            readonly={readonly}
                        />
                    ))}
                </View>
            ) : (
                /* Empty state */
                <RippleButton
                    onPress={openAdd}
                    style={mainStyles.emptyCard}
                    rippleColor="rgba(103,51,208,0.10)"
                >
                    <Ionicons name="link-outline" size={28} color={PURPLE_LIGHT.replace('ede6ff', 'b8a0e8')} />
                    <View style={{ gap: 2 }}>
                        <Text style={mainStyles.emptyTitle}>Add a link to your profile</Text>
                        <Text style={mainStyles.emptySubtitle}>Portfolio, social, or any URL</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={20} color={PURPLE} />
                </RippleButton>
            )}

            {/* Add/Edit sheet */}
            <AddEditSheet
                visible={sheetVisible}
                editing={editingEntry}
                onClose={() => { setSheetVisible(false); setEditingEntry(null); }}
                onSave={handleSave}
            />
        </View>
    );
};

const mainStyles = StyleSheet.create({
    wrapper: {
        gap: 8,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: INK_MUTED,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
    },
    sectionCount: {
        fontSize: 11,
        color: INK_MUTED,
        fontWeight: '500',
    },
    addBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        backgroundColor: WHITE,
        borderRadius: 18,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: SHADOW,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 1,
                shadowRadius: 10,
            },
            android: { elevation: 3 },
        }),
    },
    emptyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: PURPLE_XLIGHT,
        borderRadius: 16,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: PURPLE_LIGHT,
        paddingVertical: 16,
        paddingHorizontal: 16,
        overflow: 'hidden',
    },
    emptyTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: INK,
    },
    emptySubtitle: {
        fontSize: 12,
        color: INK_MUTED,
    },
});

export default memo(AddLink);
