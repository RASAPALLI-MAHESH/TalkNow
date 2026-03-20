import AvatarPicker from '@/app/components/AvatarPicker';
import { checkUsernameAvailability, getAuthErrorMessage } from '@/services/AuthService';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import {
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RouteParams = {
	Firstname: string;
	email: string;
	otp: string;
	avatarUri?: string;
	profilePicture?: string;
	username?: string;
};

const AvatarandAge = ({ navigation, route }: { navigation: any; route: { params?: RouteParams } }) => {
	const Firstname = String(route?.params?.Firstname ?? '').trim();
	const email = String(route?.params?.email ?? '').trim();
	const otp = String(route?.params?.otp ?? '').trim();
	const [avatarUri, setAvatarUri] = useState(String(route?.params?.avatarUri ?? ''));
	const [profilePicturePayload, setProfilePicturePayload] = useState(String(route?.params?.profilePicture ?? route?.params?.avatarUri ?? ''));
	const [username, setUsername] = useState(String(route?.params?.username ?? ''));
	const [checking, setChecking] = useState(false);
	const [helper, setHelper] = useState('This username will be visible across the app.');
	const scrollRef = React.useRef<ScrollView | null>(null);

	const trimmedUsername = useMemo(() => username.trim(), [username]);
	const usernameFormatValid = /^[a-zA-Z0-9_]{3,24}$/.test(trimmedUsername);

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
					setProfilePicturePayload(asset.uri);
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
				setHelper('This username is already taken. Try another one.');
				Alert.alert('Username unavailable', 'Try a different username.');
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
		<>
			<StatusBar barStyle="dark-content" backgroundColor="#f7f9fe" />
			<SafeAreaView style={styles.safe}>
				<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
					<KeyboardAvoidingView
						style={styles.safe}
						behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
						keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
					>
						<ScrollView
							ref={scrollRef}
							contentContainerStyle={styles.content}
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="interactive"
							showsVerticalScrollIndicator={false}
						>
							<LinearGradient
								colors={['#f0f9ff', '#f7f9fe']}
								start={{ x: 0, y: 0 }}
								end={{ x: 1, y: 1 }}
								style={styles.hero}
							>
								<Text style={styles.title}>Profile Setup</Text>
								<Text style={styles.subtitle}>Add your photo and username so friends can find you instantly</Text>
							</LinearGradient>

							<Pressable
								onPress={pickAvatar}
								style={({ pressed }) => [styles.avatarPressable, pressed && styles.pressed]}
								accessibilityRole="button"
								accessibilityLabel="Choose profile photo"
							>
								{avatarUri ? (
									<AvatarPicker
										uri={avatarUri}
										name={trimmedUsername || Firstname || 'User'}
										size={120}
										style={styles.avatarImage}
										previewEnabled
									/>
								) : (
									<View style={styles.avatarPlaceholder}>
										<Ionicons name="person" size={56} color="#a0a7b4" />
									</View>
								)}
								<View style={styles.cameraBadge}>
									<Ionicons name="camera" size={18} color="#fff" />
								</View>
							</Pressable>

							<Text style={styles.avatarHint}>Tap to add profile photo</Text>

							<View style={styles.formCard}>
								<Text style={styles.inputLabel}>Username</Text>
								<TextInput
									style={styles.input}
									value={username}
									onChangeText={(value) => {
										setUsername(value);
										setHelper('This username will be visible across the app.');
									}}
									onFocus={() => {
										setTimeout(() => {
											scrollRef.current?.scrollTo({ y: 260, animated: true });
										}, 80);
									}}
									autoCapitalize="none"
									autoCorrect={false}
									placeholder="choose_username"
									placeholderTextColor="#96a0b1"
									maxLength={24}
								/>
								<Text style={[styles.helperText, helper.includes('available') && styles.helperTextSuccess]}>{helper}</Text>
							</View>

							<View style={styles.footerButtons}>
								<Pressable
									onPress={() => navigation.goBack()}
									style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
								>
									<Text style={styles.skipText}>Back</Text>
								</Pressable>

								<Pressable
									onPress={onContinue}
									disabled={!usernameFormatValid || checking}
									style={({ pressed }) => [
										styles.continueButton,
										(!usernameFormatValid || checking) && styles.continueButtonDisabled,
										pressed && styles.pressed,
									]}
								>
									<Text style={styles.continueText}>{checking ? 'Checking...' : 'Next'}</Text>
								</Pressable>
							</View>
						</ScrollView>
					</KeyboardAvoidingView>
				</TouchableWithoutFeedback>
			</SafeAreaView>
		</>
	);
};

const styles = StyleSheet.create({
	safe: {
		flex: 1,
		backgroundColor: '#f6f7fb',
	},
	content: {
		flexGrow: 1,
		alignItems: 'center',
		paddingHorizontal: 24,
		paddingTop: 20,
		paddingBottom: 18,
	},
	hero: {
		width: '100%',
		borderRadius: 20,
		paddingHorizontal: 18,
		paddingVertical: 18,
		borderWidth: 1,
		borderColor: '#e6edf9',
	},
	title: {
		fontSize: 24,
		fontWeight: '800',
		color: '#1b1f2a',
		letterSpacing: -0.3,
	},
	subtitle: {
		marginTop: 8,
		textAlign: 'left',
		color: '#5b6473',
		fontSize: 15,
		lineHeight: 22,
	},
	avatarPressable: {
		marginTop: 28,
		width: 136,
		height: 136,
		borderRadius: 68,
	},
	avatarImage: {
		width: '100%',
		height: '100%',
		borderRadius: 68,
		borderWidth: 3,
		borderColor: '#25d366',
	},
	avatarPlaceholder: {
		width: '100%',
		height: '100%',
		borderRadius: 68,
		backgroundColor: '#e7e9ef',
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: '#d7dbe5',
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
		backgroundColor: '#25d366',
		borderWidth: 2,
		borderColor: '#fff',
	},
	avatarHint: {
		marginTop: 12,
		fontSize: 14,
		color: '#4f596a',
		fontWeight: '500',
	},
	formCard: {
		marginTop: 30,
		width: '100%',
		backgroundColor: '#fff',
		borderRadius: 16,
		paddingVertical: 18,
		paddingHorizontal: 16,
		borderWidth: 1,
		borderColor: '#e2e6ef',
	},
	inputLabel: {
		fontSize: 15,
		fontWeight: '700',
		color: '#2b3240',
		marginBottom: 10,
	},
	input: {
		height: 52,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: '#d8dde8',
		backgroundColor: '#f9fbff',
		paddingHorizontal: 14,
		fontSize: 16,
		color: '#1f2430',
	},
	helperText: {
		marginTop: 8,
		fontSize: 12,
		color: '#728096',
	},
	helperTextSuccess: {
		color: '#0d7f4d',
	},
	footerButtons: {
		marginTop: 24,
		width: '100%',
		flexDirection: 'row',
		gap: 12,
		paddingBottom: 8,
	},
	skipButton: {
		flex: 1,
		height: 52,
		borderRadius: 14,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#edf0f5',
	},
	continueButton: {
		flex: 2,
		height: 52,
		borderRadius: 14,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#0d4d47',
	},
	continueButtonDisabled: {
		backgroundColor: '#90aaa7',
	},
	skipText: {
		color: '#4f596a',
		fontSize: 16,
		fontWeight: '700',
	},
	continueText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '700',
	},
	pressed: {
		opacity: 0.82,
	},
});

export default AvatarandAge;
