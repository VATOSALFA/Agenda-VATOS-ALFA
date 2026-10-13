// src/lib/dropdown-coordinator.ts
// Global coordinator to ensure only ONE dropdown/select/popover can be open at a time

type DropdownListener = (activeId: string) => void;

class DropdownCoordinator {
  private listeners = new Set<DropdownListener>();

  subscribe(listener: DropdownListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyOpen(id: string): void {
    this.listeners.forEach((fn) => {
      try {
        fn(id);
      } catch (err) {
        console.error("Error in dropdown coordinator listener:", err);
      }
    });
  }

  closeAll(): void {
    this.notifyOpen('__CLOSE_ALL__');
  }
}

export const dropdownCoordinator = new DropdownCoordinator();
