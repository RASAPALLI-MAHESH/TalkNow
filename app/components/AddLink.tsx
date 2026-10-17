/**
 * AddLink.tsx: the "Additional Links" section of a profile.
 *
 * Each entry has a label (display text) and a URL. Owners add, edit and
 * delete links in a sheet; visitors see a read-only list that opens each link.
 *
 * Usage:
 *   <AddLink
 *       initialLinks={user.links}          // seed data; later changes to it are picked up
 *       onChange={(links) => save(links)}  // called on every add/edit/delete
 *       maxLinks={5}                       // default 5
 *   />
 */

import { BottomSheet, Button, IconButton, ListSection, PressableScale, TextField } from '@/app/components/ui';
import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Linking, Text, TextInput, View } from 'react-native';

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

/* ─── URL helpers ─── */
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

const displayUrl = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

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
    const s = useStyles();
    const { colors } = useTheme();
    const icon = domainIcon(entry.url);

    const handleOpen = () => {
        if (isValidUrl(entry.url)) Linking.openURL(entry.url).catch(() => {});
    };

    return (
        <View style={s.row}>
            <PressableScale
                onPress={handleOpen}
                scaleTo={1}
                style={s.rowMain}
                pressedStyle={s.rowPressed}
                accessibilityRole="link"
                accessibilityLabel={`${entry.label || 'Link'}, ${displayUrl(entry.url)}`}
            >
                <View style={s.iconTile}>
                    <Ionicons name={icon} size={18} color={colors.tintText} />
                </View>
                <View style={s.rowText}>
                    <Text style={s.rowLabel} numberOfLines={1}>{entry.label || 'Link'}</Text>
                    <Text style={s.rowUrl} numberOfLines={1}>{displayUrl(entry.url)}</Text>
                </View>
                {readonly && <Ionicons name="open-outline" size={16} color={colors.tertiaryLabel} />}
            </PressableScale>

            {!readonly && (
                <View style={s.rowActions}>
                    <IconButton name="pencil" iconSize={17} color={colors.tintText} onPress={onEdit} accessibilityLabel={`Edit ${entry.label || 'link'}`} />
                    <IconButton name="trash-outline" iconSize={17} color={colors.danger} onPress={onDelete} accessibilityLabel={`Delete ${entry.label || 'link'}`} />
                </View>
            )}
        </View>
    );
});

/* ─── Sheet for add / edit ─── */
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
    const urlRef = useRef<TextInput>(null);

    /* Populate fields when the sheet opens */
    useEffect(() => {
        if (!visible) return;
        setLabel(editing?.label ?? '');
        setUrl(editing?.url ?? '');
        setUrlError('');
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
    const looksValid = url.trim().length > 0 && isValidUrl(normalizeUrl(url));

    return (
        <BottomSheet visible={visible} onClose={handleClose} title={isNew ? 'Add Link' : 'Edit Link'}>
            <View style={{ gap: 16 }}>
                <TextField
                    label="Display text (optional)"
                    icon="text-outline"
                    placeholder="e.g. My Portfolio"
                    value={label}
                    onChangeText={setLabel}
                    returnKeyType="next"
                    autoCapitalize="words"
                    maxLength={60}
                    onSubmitEditing={() => urlRef.current?.focus()}
                />
                <TextField
                    ref={urlRef}
                    label="URL"
                    icon="link-outline"
                    placeholder="https://example.com"
                    value={url}
                    onChangeText={(t) => { setUrl(t); setUrlError(''); }}
                    error={urlError || undefined}
                    success={!urlError && looksValid ? 'Looks good' : undefined}
                    returnKeyType="done"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    textContentType="URL"
                    maxLength={500}
                    onSubmitEditing={handleSave}
                />
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                    <Button title="Cancel" variant="gray" onPress={handleClose} style={{ flex: 1 }} />
                    <Button
                        title={isNew ? 'Add Link' : 'Save Changes'}
                        onPress={handleSave}
                        disabled={!url.trim()}
                        style={{ flex: 2 }}
                    />
                </View>
            </View>
        </BottomSheet>
    );
});

/* ─── Main AddLink component ─── */
const AddLink = ({
    initialLinks = [],
    onChange,
    maxLinks = 5,
    sectionTitle = 'Links',
    readonly = false,
}: AddLinkProps) => {
    const s = useStyles();
    const { colors } = useTheme();
    const [links, setLinks] = useState<LinkEntry[]>(initialLinks);
    const [sheetVisible, setSheetVisible] = useState(false);
    const [editingEntry, setEditingEntry] = useState<LinkEntry | null>(null);

    // The profile loads after this mounts: take the saved links when they arrive,
    // otherwise the first edit would overwrite them with an empty list.
    const seededRef = useRef(initialLinks.length > 0);
    useEffect(() => {
        if (!seededRef.current && initialLinks.length > 0) {
            seededRef.current = true;
            setLinks(initialLinks);
        }
    }, [initialLinks]);

    /* Notify parent on every mutation */
    const updateLinks = (next: LinkEntry[]) => {
        seededRef.current = true;
        setLinks(next);
        onChange?.(next);
    };

    const openAdd = () => {
        setEditingEntry(null);
        setSheetVisible(true);
    };

    const openEdit = (entry: LinkEntry) => {
        setEditingEntry(entry);
        setSheetVisible(true);
    };

    const handleDelete = (entry: LinkEntry) => {
        Alert.alert('Delete link?', `"${entry.label || displayUrl(entry.url)}" will be removed from your profile.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => updateLinks(links.filter(l => l.id !== entry.id)) },
        ]);
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
        <View style={s.wrapper}>
            <View style={s.header}>
                <Text style={s.title} accessibilityRole="header">{sectionTitle}</Text>
                {!readonly && <Text style={s.count}>{links.length}/{maxLinks}</Text>}
            </View>

            {links.length > 0 ? (
                <ListSection style={s.section} iconRows>
                    {links.map((entry) => (
                        <LinkRow
                            key={entry.id}
                            entry={entry}
                            onEdit={() => openEdit(entry)}
                            onDelete={() => handleDelete(entry)}
                            readonly={readonly}
                        />
                    ))}
                    {!readonly && !atMax && (
                        <PressableScale onPress={openAdd} scaleTo={1} style={s.addRow} pressedStyle={s.rowPressed} accessibilityRole="button" accessibilityLabel="Add link">
                            <View style={s.iconTile}>
                                <Ionicons name="add" size={20} color={colors.tintText} />
                            </View>
                            <Text style={s.addText}>Add link</Text>
                        </PressableScale>
                    )}
                </ListSection>
            ) : (
                /* Empty state */
                <PressableScale
                    onPress={openAdd}
                    style={s.emptyCard}
                    pressedStyle={s.rowPressed}
                    accessibilityRole="button"
                    accessibilityLabel="Add a link to your profile"
                >
                    <View style={s.iconTile}>
                        <Ionicons name="link-outline" size={18} color={colors.tintText} />
                    </View>
                    <View style={s.rowText}>
                        <Text style={s.rowLabel}>Add a link to your profile</Text>
                        <Text style={s.emptySub}>Portfolio, social, or any URL</Text>
                    </View>
                    <Ionicons name="add-circle" size={22} color={colors.tintText} />
                </PressableScale>
            )}

            <AddEditSheet
                visible={sheetVisible}
                editing={editingEntry}
                onClose={() => { setSheetVisible(false); setEditingEntry(null); }}
                onSave={handleSave}
            />
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    wrapper: {
        gap: t.space.sm,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginHorizontal: t.space.gutter + t.space.lg,
    },
    title: {
        ...t.type.footnote,
        fontWeight: '600',
        color: t.colors.secondaryLabel,
    },
    count: {
        ...t.type.caption1,
        color: t.colors.secondaryLabel,
        fontVariant: ['tabular-nums'],
    },
    section: {
        marginHorizontal: t.space.gutter,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: t.colors.surface,
    },
    rowMain: {
        flex: 1,
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.md,
        paddingLeft: t.space.lg,
        paddingRight: t.space.sm,
        paddingVertical: t.space.sm,
    },
    rowPressed: {
        backgroundColor: t.colors.pressedOverlay,
    },
    rowActions: {
        flexDirection: 'row',
        paddingRight: t.space.xs,
    },
    iconTile: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: t.colors.tintSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowText: {
        flex: 1,
        minWidth: 0,
        gap: 1,
    },
    rowLabel: {
        ...t.type.callout,
        fontWeight: '600',
        color: t.colors.label,
    },
    rowUrl: {
        ...t.type.footnote,
        color: t.colors.tintText,
    },
    addRow: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.md,
        paddingHorizontal: t.space.lg,
        backgroundColor: t.colors.surface,
    },
    addText: {
        ...t.type.body,
        color: t.colors.tintText,
    },
    emptyCard: {
        marginHorizontal: t.space.gutter,
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.md,
        paddingHorizontal: t.space.lg,
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.surface,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: t.colors.fillStrong,
    },
    emptySub: {
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
    },
}));

LinkRow.displayName = 'LinkRow';
AddEditSheet.displayName = 'AddEditSheet';

export default AddLink;
