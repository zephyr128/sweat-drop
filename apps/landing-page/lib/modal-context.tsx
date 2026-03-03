'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ApplyPilotModal } from '@/components/modals/ApplyPilotModal';
import { SponsorProposalModal } from '@/components/modals/SponsorProposalModal';
import { WaitlistModal } from '@/components/modals/WaitlistModal';
import { ContactModal } from '@/components/modals/ContactModal';

type ModalType = 'apply-pilot' | 'sponsor-proposal' | 'waitlist' | 'contact' | null;

interface ModalState {
  type: ModalType;
  props?: Record<string, any>;
}

interface ModalContextValue {
  openModal: (type: ModalType, props?: Record<string, any>) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<ModalState>({ type: null });

  const openModal = useCallback((type: ModalType, props?: Record<string, any>) => {
    setModalState({ type, props });
  }, []);

  const closeModal = useCallback(() => {
    setModalState({ type: null });
  }, []);

  return (
    <ModalContext.Provider value={{ openModal, closeModal }}>
      {children}
      {/* Render modals */}
      {modalState.type === 'apply-pilot' && (
        <ApplyPilotModal
          isOpen={true}
          onClose={closeModal}
          selectedPlan={modalState.props?.initialPlan}
        />
      )}
      {modalState.type === 'sponsor-proposal' && (
        <SponsorProposalModal
          isOpen={true}
          onClose={closeModal}
          initialPlan={modalState.props?.plan}
          founding={modalState.props?.founding}
        />
      )}
      {modalState.type === 'waitlist' && (
        <WaitlistModal
          isOpen={true}
          onClose={closeModal}
          source={modalState.props?.source || 'organic'}
        />
      )}
      {modalState.type === 'contact' && (
        <ContactModal
          isOpen={true}
          onClose={closeModal}
        />
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }
  return context;
}
