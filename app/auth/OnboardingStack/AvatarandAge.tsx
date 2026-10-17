import AvatarPicker from '@/app/components/AvatarPicker';
import { Button, PressableScale, TextField } from '@/app/components/ui';
import { checkUsernameAvailability, getAuthErrorMessage } from '@/services/AuthService';
import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import AuthScaffold from '../AuthScaffold';

type RouteParams = {
	Firstname: string;
	email: string;
	otp: string;
	avatarUri?: string;
	profilePicture?: string;
	username?: string;
};

const DEFAULT_HELPER = 'This username will be visible across the app.';

const AvatarandAge = ({ navigation, route }: { navigation: any; route: { params?: RouteParams } }) => {
	const s = useStyles();
	const { colors } = useTheme();
	const Firstname = String(route?.params?.Firstname ?? '').trim();
	const email = String(route?.params?.email ?? '').trim();
	const otp = String(route?.params?.otp ?? '').trim();
	const [avatarUri, setAvatarUri] = useState(String(route?.params?.avatarUri ?? ''));
	const [profilePicturePayload, setProfilePicturePayload] = useState(String(route?.params?.profilePicture ?? ''));
	const [username, setUsername] = useState(String(route?.params?.username ?? ''));
	const [checking, setChecking] = useState(false);
	const [helper, setHelper] = useState(DEFAULT_HELPER);
	const [taken, setTaken] = useState(false);

	const trimmedUsername = useMemo(() => username.trim(), [username]);
	const usernameFormatValid = /^[a-zA-Z0-9_]{3,24}$/.test(trimmedUsername);
	const formatError =
		trimmedUsername.length > 0 && !usernameFormatValid
			? 'Use 3-24 characters with letters, numbers, or underscore.'
			: undefined;

	const pickAvatar = useCallback(async () => {
		try {
			const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
			if (!permission.granted) {
				Alert.alert('Permission required', 'Allow media access to select your profile photo.');
				return;
			}

			const result = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ['images'],
				allowsEditing: true,
				aspect: [1, 1],
				base64: true,
				quality: 0.9,
			});

			if (!result.canceled && result.assets?.[0]?.uri) {
				const asset = result.assets[0];
				setAvatarUri(asset.uri);
				if (typeof asset.base64 === 'string' && asset.base64.length > 0) {
					const mimeType = typeof asset.mimeType === 'string' && asset.mimeType.length > 0 ? asset.mimeType : 'image/jpeg';
					setProfilePicturePayload(`data:${mimeType};base64,${asset.base64}`);
				} else {
					// A device-local file path is useless to other users; skip the avatar instead.
					setAvatarUri('');
					setProfilePicturePayload('');
					Alert.alert('Image error', 'Could not read that photo. Please pick another one.');
				}
			}
		} catch (_err) {
			Alert.alert('Image error', 'Could not open gallery. Please try again.');
		}
	}, []);

	const onContinue = useCallback(async () => {
		if (!Firstname || !email || otp.length !== 6) {
			Alert.alert('Session expired', 'Please verify OTP again to continue signup.');
			navigation.navigate('SignUp');
			return;
		}

		if (!usernameFormatValid) {
			Alert.alert('Username invalid', 'Use 3-24 characters with letters, numbers, or underscore.');
			return;
		}

		try {
			setChecking(true);
			const result = await checkUsernameAvailability(trimmedUsername);
			if (!result?.available) {
				setTaken(true);
				setHelper('This username is already taken. Try another one.');
				return;
			}
			if (typeof result?.message === 'string' && result.message.includes('endpoint unavailable')) {
				setHelper('Proceeding. Username will be verified at account creation.');
			} else {
				setHelper('Great choice. This username is available.');
			}
		} catch (error: any) {
			Alert.alert('Check failed', getAuthErrorMessage(error, 'Could not verify username right now.'));
			return;
		} finally {
			setChecking(false);
		}

		navigation.navigate('PasswordSetup', {
			Firstname,
			email,
			otp,
			avatarUri,
			profilePicture: profilePicturePayload,
			username: trimmedUsername,
		});
	}, [Firstname, email, otp, usernameFormatValid, navigation, avatarUri, profilePicturePayload, trimmedUsername]);

	return (
		<AuthScaffold
			icon="person-circle-outline"
			title="Profile Setup"
			subtitle="Add your photo and username so friends can find you instantly"
			onBack={() => navigation.goBack()}
			step={{ step: 3, of: 4 }}
		>
			<View style={s.avatarBlock}>
				<PressableScale
					onPress={pickAvatar}
					style={s.avatarPressable}
					accessibilityRole="button"
					accessibilityLabel={avatarUri ? 'Change profile photo' : 'Choose profile photo'}
				>
					{avatarUri ? (
						<AvatarPicker
							uri={avatarUri}
							name={trimmedUsername || Firstname || 'User'}
							size={120}
							style={s.avatarImage}
							previewEnabled={false}
						/>
					) : (
						<View style={s.avatarPlaceholder}>
							<Ionicons name="person" size={52} color={colors.tertiaryLabel} />
						</View>
					)}
					<View style={s.cameraBadge}>
						<Ionicons name="camera" size={17} color={colors.onTint} />
					</View>
				</PressableScale>
				<Text style={s.avatarHint}>{avatarUri ? 'Tap to change photo' : 'Tap to add profile photo'}</Text>
			</View>

			<TextField
				label="Username"
				prefix="@"
				value={username}
				onChangeText={(value) => {
					setUsername(value);
					setTaken(false);
					setHelper(DEFAULT_HELPER);
				}}
				autoCapitalize="none"
				autoCorrect={false}
				autoComplete="username-new"
				textContentType="username"
				placeholder="choose_username"
				maxLength={24}
				returnKeyType="next"
				onSubmitEditing={() => void onContinue()}
				error={formatError ?? (taken ? helper : undefined)}
				success={!taken && helper.includes('available') ? helper : undefined}
				helper={helper}
				testID="onboarding-username"
			/>

			<View style={s.footerButtons}>
				<Button title="Back" variant="gray" onPress={() => navigation.goBack()} style={s.back} />
				<Button
					title={checking ? 'Checking...' : 'Next'}
					onPress={() => void onContinue()}
					disabled={!usernameFormatValid || checking}
					style={s.next}
				/>
			</View>
		</AuthScaffold>
	);
};

const useStyles = makeStyles((t) => ({
	avatarBlock: {
		alignItems: 'center',
		marginBottom: t.space.sm,
	},
	avatarPressable: {
		width: 128,
		height: 128,
		borderRadius: 64,
		alignItems: 'center',
		justifyContent: 'center',
	},
	avatarImage: {
		width: 120,
		height: 120,
		borderRadius: 60,
	},
	avatarPlaceholder: {
		width: 120,
		height: 120,
		borderRadius: 60,
		backgroundColor: t.colors.surface,
		borderWidth: 1.5,
		borderStyle: 'dashed',
		borderColor: t.colors.tintText,
		alignItems: 'center',
		justifyContent: 'center',
	},
	cameraBadge: {
		position: 'absolute',
		right: 2,
		bottom: 2,
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: t.colors.tint,
		borderWidth: 3,
		borderColor: t.colors.ground,
	},
	avatarHint: {
		...t.type.footnote,
		color: t.colors.secondaryLabel,
		marginTop: t.space.md,
	},
	footerButtons: {
		marginTop: t.space.sm,
		flexDirection: 'row',
		gap: t.space.md,
	},
	back: {
		flex: 1,
	},
	next: {
		flex: 2,
	},
}));

export default AvatarandAge;
