import { User, SavedBalloon, UserHistory, Stroke } from './types';
import { storageManager } from './storageManager';

type UserChangeCallback = (user: User | null) => void;

export class UserSession {
    private currentUser: User | null = null;
    private onUserChangeCallbacks: UserChangeCallback[] = [];

    constructor() {
        // Try to load the last active user
        this.currentUser = storageManager.getCurrentUser();
    }

    // Get current user
    getCurrentUser(): User | null {
        return this.currentUser;
    }

    // Create or switch to a user
    setUser(userName: string): User {
        // Check if user already exists
        let user = storageManager.getUserByName(userName);

        if (!user) {
            // Create new user
            user = {
                id: this.generateUserId(),
                name: userName.trim(),
                createdAt: Date.now(),
            };
            storageManager.saveUser(user);
        }

        this.currentUser = user;
        storageManager.setCurrentUser(user);
        this.notifyUserChange(user);

        return user;
    }

    // Logout current user
    logout(): void {
        this.currentUser = null;
        storageManager.setCurrentUser(null);
        this.notifyUserChange(null);
    }

    // Get all users
    getAllUsers(): User[] {
        return storageManager.getAllUsers();
    }

    // Get user history
    getUserHistory(userId?: string): UserHistory {
        const targetUserId = userId || this.currentUser?.id;
        if (!targetUserId) {
            throw new Error('No user ID provided and no current user');
        }
        return storageManager.getUserHistory(targetUserId);
    }

    // Save a balloon to current user's history
    saveBalloon(stroke: Stroke, color: string): void {
        if (!this.currentUser) {
            console.warn('Cannot save balloon: no user logged in');
            return;
        }

        const savedBalloon: SavedBalloon = {
            id: this.generateBalloonId(),
            stroke: { ...stroke }, // Clone to avoid reference issues
            color,
            createdAt: Date.now(),
        };

        storageManager.addBalloonToHistory(this.currentUser.id, savedBalloon);
    }

    // Clear current user's history
    clearHistory(): void {
        if (!this.currentUser) {
            console.warn('Cannot clear history: no user logged in');
            return;
        }
        storageManager.clearUserHistory(this.currentUser.id);
    }

    // Listen to user changes
    onUserChange(callback: UserChangeCallback): void {
        this.onUserChangeCallbacks.push(callback);
    }

    private notifyUserChange(user: User | null): void {
        this.onUserChangeCallbacks.forEach(cb => cb(user));
    }

    private generateUserId(): string {
        return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    private generateBalloonId(): string {
        return `balloon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    // Export/Import
    exportData(): string {
        return storageManager.exportData();
    }

    importData(jsonData: string): boolean {
        return storageManager.importData(jsonData);
    }
}

export const userSession = new UserSession();
