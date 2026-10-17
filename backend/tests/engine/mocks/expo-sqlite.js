// expo-sqlite's async API on top of node:sqlite. SQLCipher pragmas are accepted and ignored.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dir = () => process.env.TEST_SQLITE_DIR;
const params = (args) => (args.length === 1 && Array.isArray(args[0]) ? args[0] : args);

class Database {
    constructor(file) {
        this.db = new DatabaseSync(file);
    }
    async execAsync(sql) {
        if (/^\s*PRAGMA\s+key\b/i.test(sql)) return;
        this.db.exec(sql);
    }
    async getFirstAsync(sql, ...args) {
        if (/PRAGMA\s+cipher_version/i.test(sql)) return { cipher_version: 'node-test' };
        return this.db.prepare(sql).get(...params(args)) ?? null;
    }
    async getAllAsync(sql, ...args) {
        return this.db.prepare(sql).all(...params(args));
    }
    async runAsync(sql, ...args) {
        const r = this.db.prepare(sql).run(...params(args));
        return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    }
    async withTransactionAsync(task) {
        this.db.exec('BEGIN');
        try {
            await task();
            this.db.exec('COMMIT');
        } catch (err) {
            this.db.exec('ROLLBACK');
            throw err;
        }
    }
    async closeAsync() {
        if (this.db.isOpen) this.db.close();
    }
}

exports.openDatabaseAsync = async (name) => new Database(path.join(dir(), name));
exports.deleteDatabaseAsync = async (name) => {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(path.join(dir(), name + suffix), { force: true });
};
