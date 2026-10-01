/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WalkthroughModal: Decommissioned for production compliance.
 */

import React from 'react';

export interface WalkthroughModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onNavigate?: (tab: any) => void;
  onNavigateToTab?: (tab: any) => void;
}

export const WalkthroughModal: React.FC<WalkthroughModalProps> = () => {
  return null;
};
