import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import PressableScale from './PressableScale';

/* Grouped inset list: the shape for settings, contact info and account rows. */

export const ListSection = ({
    title,
    footer,
    children,
    style,
    iconRows = true,
}: {
    title?: string;
    footer?: string;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    /** Rows lead with an icon tile, so separators start after it. */
    iconRows?: boolean;
}) => {
    const s = useStyles();
    const rows = React.Children.toArray(children).filter(Boolean);
    return (
        <View style={[s.section, style]}>
            {!!title && (
                <Text style={s.sectionTitle} accessibilityRole="header">
                    {title}
                </Text>
            )}
            <View style={s.group}>
                {rows.map((row, i) => (
                    <View key={i}>
                        {row}
                        {i < rows.length - 1 && <View style={[s.separator, !iconRows && s.separatorFlush]} />}
                    </View>
                ))}
            </View>
            {!!footer && <Text style={s.footer}>{footer}</Text>}
        </View>
    );
};

type RowProps = {
    title: string;
    subtitle?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    /** Text on the right, e.g. a current value. */
    value?: string;
    accessory?: 'chevron' | 'external' | 'none';
    /** Replaces the accessory. */
    trailing?: React.ReactNode;
    destructive?: boolean;
    loading?: boolean;
    onPress?: () => void;
    accessibilityLabel?: string;
    testID?: string;
};

export const ListRow = ({
    title,
    subtitle,
    icon,
    value,
    accessory = 'chevron',
    trailing,
    destructive = false,
    loading = false,
    onPress,
    accessibilityLabel,
    testID,
}: RowProps) => {
    const s = useStyles();
    const { colors } = useTheme();
    const tone = destructive ? colors.danger : colors.tintText;

    const body = (
        <>
            {icon && (
                <View style={[s.iconTile, destructive && s.iconTileDanger]}>
                    <Ionicons name={icon} size={18} color={tone} />
                </View>
            )}
            <View style={s.text}>
                <Text style={[s.title, destructive && { color: colors.danger }]} numberOfLines={1}>
                    {title}
                </Text>
                {!!subtitle && (
                    <Text style={s.subtitle} numberOfLines={2}>
                        {subtitle}
                    </Text>
                )}
            </View>
            {!!value && (
                <Text style={s.value} numberOfLines={1}>
                    {value}
                </Text>
            )}
            {loading ? (
                <ActivityIndicator size="small" color={colors.secondaryLabel} />
            ) : (
                trailing ??
                (onPress && accessory !== 'none' ? (
                    <Ionicons
                        name={accessory === 'external' ? 'open-outline' : 'chevron-forward'}
                        size={accessory === 'external' ? 16 : 17}
                        color={colors.tertiaryLabel}
                    />
                ) : null)
            )}
        </>
    );

    if (!onPress) {
        return (
            <View style={s.row} testID={testID}>
                {body}
            </View>
        );
    }

    return (
        <PressableScale
            onPress={onPress}
            disabled={loading}
            scaleTo={1}
            style={s.row}
            pressedStyle={s.rowPressed}
            accessibilityRole={accessory === 'external' ? 'link' : 'button'}
            accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
            testID={testID}
        >
            {body}
        </PressableScale>
    );
};

const useStyles = makeStyles((t) => ({
    section: {
        marginHorizontal: t.space.gutter,
    },
    sectionTitle: {
        ...t.type.footnote,
        fontWeight: '600',
        color: t.colors.secondaryLabel,
        marginBottom: t.space.sm,
        marginLeft: t.space.lg,
    },
    group: {
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.surface,
        overflow: 'hidden',
    },
    separator: {
        height: t.size.hairline,
        backgroundColor: t.colors.separator,
        marginLeft: 60,
    },
    separatorFlush: {
        marginLeft: t.space.lg,
    },
    footer: {
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
        marginTop: t.space.sm,
        marginHorizontal: t.space.lg,
    },
    row: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.md,
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.md,
        backgroundColor: t.colors.surface,
    },
    rowPressed: {
        backgroundColor: t.colors.pressedOverlay,
    },
    iconTile: {
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: t.colors.tintSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconTileDanger: {
        backgroundColor: t.colors.dangerSoft,
    },
    text: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    title: {
        ...t.type.body,
        color: t.colors.label,
    },
    subtitle: {
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
    },
    value: {
        ...t.type.body,
        color: t.colors.secondaryLabel,
        maxWidth: '45%',
    },
}));
