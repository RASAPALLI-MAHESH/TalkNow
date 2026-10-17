/** Runs tasks with the same key one at a time, in call order. */
export class KeyedMutex {
    private tails = new Map<string, Promise<unknown>>();

    run<T>(key: string, task: () => Promise<T>): Promise<T> {
        const previous = this.tails.get(key) ?? Promise.resolve();
        const result = previous.then(task, task);
        const tail = result.catch(() => undefined);
        this.tails.set(key, tail);
        void tail.then(() => {
            if (this.tails.get(key) === tail) this.tails.delete(key);
        });
        return result;
    }
}
