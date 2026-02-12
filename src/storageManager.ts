import { User, UserHistory, SavedBalloon } from './types';

const STORAGE_KEYS = {
    USERS: 'hand_canvas_users',
    CURRENT_USER: 'hand_canvas_current_user',
    HISTORY_PREFIX: 'hand_canvas_history_',
};

export class StorageManager {
    private static instance: StorageManager;

    private constructor() { }

    static getInstance(): StorageManager {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }

    // User management
    getAllUsers(): User[] {
        const usersJson = localStorage.getItem(STORAGE_KEYS.USERS);
        if (!usersJson) return [];
        try {
            return JSON.parse(usersJson);
        } catch (e) {
            console.error('Failed to parse users:', e);
            return [];
        }
    }

    saveUser(user: User): void {
        const users = this.getAllUsers();
        const existingIndex = users.findIndex(u => u.id === user.id);

        if (existingIndex >= 0) {
            users[existingIndex] = user;
        } else {
            users.push(user);
        }

        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }

    getUserById(userId: string): User | null {
        const users = this.getAllUsers();
        return users.find(u => u.id === userId) || null;
    }

    getUserByName(name: string): User | null {
        const users = this.getAllUsers();
        return users.find(u => u.name.toLowerCase() === name.toLowerCase()) || null;
    }

    // Current user
    getCurrentUser(): User | null {
        const userJson = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (!userJson) return null;
        try {
            return JSON.parse(userJson);
        } catch (e) {
            console.error('Failed to parse current user:', e);
            return null;
        }
    }

    setCurrentUser(user: User | null): void {
        if (user) {
            localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
        } else {
            localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        }
    }

    // History management
    getUserHistory(userId: string): UserHistory {
        const key = STORAGE_KEYS.HISTORY_PREFIX + userId;
        const historyJson = localStorage.getItem(key);

        if (!historyJson) {
            return {
                userId,
                balloons: [],
                lastModified: Date.now(),
            };
        }

        try {
            return JSON.parse(historyJson);
        } catch (e) {
            console.error('Failed to parse history:', e);
            return {
                userId,
                balloons: [],
                lastModified: Date.now(),
            };
        }
    }

    saveUserHistory(history: UserHistory): void {
        const key = STORAGE_KEYS.HISTORY_PREFIX + history.userId;
        history.lastModified = Date.now();
        localStorage.setItem(key, JSON.stringify(history));
    }

    addBalloonToHistory(userId: string, balloon: SavedBalloon): void {
        const history = this.getUserHistory(userId);
        history.balloons.push(balloon);
        this.saveUserHistory(history);
    }

    clearUserHistory(userId: string): void {
        const history = this.getUserHistory(userId);
        history.balloons = [];
        this.saveUserHistory(history);
    }

    // Utility methods
    exportData(): string {
        const data = {
            users: this.getAllUsers(),
            histories: {} as Record<string, UserHistory>,
        };

        const users = this.getAllUsers();
        users.forEach(user => {
            data.histories[user.id] = this.getUserHistory(user.id);
        });

        return JSON.stringify(data, null, 2);
    }

    importData(jsonData: string): boolean {
        try {
            const data = JSON.parse(jsonData);

            // Import users
            if (data.users && Array.isArray(data.users)) {
                localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
            }

            // Import histories
            if (data.histories) {
                Object.keys(data.histories).forEach(userId => {
                    const key = STORAGE_KEYS.HISTORY_PREFIX + userId;
                    localStorage.setItem(key, JSON.stringify(data.histories[userId]));
                });
            }

            return true;
        } catch (e) {
            console.error('Failed to import data:', e);
            return false;
        }
    }

    clearAllData(): void {
        // Remove all hand_canvas related keys
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('hand_canvas_')) {
                localStorage.removeItem(key);
            }
        });
    }
}

export const storageManager = StorageManager.getInstance();
