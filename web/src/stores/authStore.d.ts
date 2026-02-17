import type { User } from '@shared/types';
interface AuthState {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    error: string | null;
    login: (username: string, password: string) => Promise<{
        token: string;
        user: User;
    }>;
    register: (username: string, displayName: string, password: string) => Promise<{
        token: string;
        user: User;
    }>;
    logout: () => void;
    hydrate: () => Promise<void>;
}
export declare const useAuthStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AuthState>>;
export {};
//# sourceMappingURL=authStore.d.ts.map