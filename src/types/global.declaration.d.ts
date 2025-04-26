declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          disableAutoSelect: () => void;
          revoke: (href: string, callback: () => void) => void;
        };
      };
    };
  }
}
export {};
