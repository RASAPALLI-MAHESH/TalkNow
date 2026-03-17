const generatePrefix = (username) => {
    username = username.toLowerCase();
    const prefix = [];
    for(let i = 1; i <= username.length; i++){
        prefix.push(username.substring(0,i));
    }
    return prefix;
}
module.exports = { generatePrefix };