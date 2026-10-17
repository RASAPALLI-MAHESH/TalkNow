const items = new Map();
exports.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY';
exports.getItemAsync = async (key) => (items.has(key) ? items.get(key) : null);
exports.setItemAsync = async (key, value) => {
    items.set(key, String(value));
};
exports.deleteItemAsync = async (key) => {
    items.delete(key);
};
exports.__items = items;
