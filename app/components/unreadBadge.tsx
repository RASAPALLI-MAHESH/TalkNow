import { StyleSheet, Text, View } from 'react-native';
const UnreadBadge = () => {
    return (
        <View style = {styles.badge}>
            <Text style = {styles.text}>Text</Text>
        </View>
    )
}
const styles = StyleSheet.create({
    badge : {
        backgroundColor : 'red',
        borderRadius : 10,
        width : 20,
        height : 20,
        justifyContent : 'center',
        alignItems : 'center',
        position : 'absolute',
        top : -5,
        right : -5,
    },
    text : {
        color : 'white',
        fontSize : 12,
        fontWeight : 'bold',
    }
})
export default UnreadBadge;