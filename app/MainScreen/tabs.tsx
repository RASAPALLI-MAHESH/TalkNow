import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import useAuth from '../../hooks/useAuth';

const HomePage = () => {
    const { user, Logout } = useAuth();

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Welcome to TalkNow!</Text>
            <Text style={styles.subtitle}>Hello, {user?.username || user?.email || "User"}!</Text>
            
            <View style={styles.card}>
                <Text style={styles.cardText}>You are successfully logged in and secured.</Text>
            </View>

            <View style={styles.buttonContainer}>
                <Button title="Logout" color="#d32f2f" onPress={Logout} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#F8FAFC'
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#0d4d47',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 20,
        color: '#475569',
        marginBottom: 30,
    },
    card: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        marginBottom: 40,
        width: '100%',
        alignItems: 'center'
    },
    cardText: {
        fontSize: 16,
        color: '#333'
    },
    buttonContainer: {
        width: '80%',
    }
});

export default HomePage;
