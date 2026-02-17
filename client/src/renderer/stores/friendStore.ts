import { create } from 'zustand';
import type { Friendship } from '../../../../shared/types';

interface FriendState {
  friends: Friendship[];
  pending: Friendship[];

  addFriendship: (friendship: Friendship) => void;
  updateFriendship: (friendship: Friendship) => void;
  removeFriendship: (friendshipId: string) => void;
  reset: () => void;
}

export const useFriendStore = create<FriendState>((set) => ({
  friends: [],
  pending: [],

  addFriendship: (friendship) => {
    if (friendship.status === 'pending') {
      set((s) => ({ pending: [...s.pending, friendship] }));
    } else {
      set((s) => ({ friends: [...s.friends, friendship] }));
    }
  },

  updateFriendship: (friendship) => {
    set((s) => ({
      friends: friendship.status === 'accepted'
        ? [...s.friends.filter((f) => f.id !== friendship.id), friendship]
        : s.friends,
      pending: s.pending.filter((p) => p.id !== friendship.id),
    }));
  },

  removeFriendship: (friendshipId) => {
    set((s) => ({
      friends: s.friends.filter((f) => f.id !== friendshipId),
      pending: s.pending.filter((p) => p.id !== friendshipId),
    }));
  },

  reset: () => {
    set({ friends: [], pending: [] });
  },
}));
