import { create } from 'zustand';

export interface AppModalButton {
  label: string;
  onPress?: () => void;
  style?: 'default' | 'destructive' | 'cancel';
}

export interface AppModalState {
  visible: boolean;
  title: string;
  body?: string;
  buttons: AppModalButton[];
  showModal: (opts: { title: string; body?: string; buttons?: AppModalButton[] }) => void;
  hideModal: () => void;
}

export const useAppModal = create<AppModalState>((set) => ({
  visible: false,
  title: '',
  body: undefined,
  buttons: [],

  showModal: ({ title, body, buttons }) =>
    set({
      visible: true,
      title,
      body,
      buttons: buttons ?? [{ label: 'OK' }],
    }),

  hideModal: () =>
    set({ visible: false, title: '', body: undefined, buttons: [] }),
}));
