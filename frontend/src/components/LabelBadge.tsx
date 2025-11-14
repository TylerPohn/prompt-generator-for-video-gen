interface LabelBadgeProps {
  label: string;
  color: string;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

export function LabelBadge({ label, color, onRemove, size = 'sm' }: LabelBadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses}`}
      style={{
        backgroundColor: color + '20', // 20% opacity
        color: color,
        borderColor: color,
        borderWidth: '1px',
      }}
    >
      {label}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70 transition-opacity"
          aria-label={`Remove ${label} label`}
        >
          ×
        </button>
      )}
    </span>
  );
}
