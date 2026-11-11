"use client";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function DriveSyncModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111] p-6 shadow-xl">
        <h2 className="text-lg font-bold text-white">Catálogo solo desde el panel</h2>
        <p className="mt-3 text-sm text-white/70">
          Los vehículos del catálogo se crean, editan y eliminan solo en este panel.
          La sincronización automática con Google Sheets, Google Drive y los cron ya no corre.
          El inventario y las fotos actuales no se tocan.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/20"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
