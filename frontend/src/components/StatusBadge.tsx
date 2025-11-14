import type { VideoStatus } from '../types';

interface StatusBadgeProps {
  status: VideoStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    pending: {
      label: 'Pending',
      className: 'bg-yellow-100 text-yellow-800',
    },
    generating: {
      label: 'Generating',
      className: 'bg-blue-100 text-blue-800',
    },
    complete: {
      label: 'Complete',
      className: 'bg-green-100 text-green-800',
    },
    error: {
      label: 'Error',
      className: 'bg-red-100 text-red-800',
    },
  };

  const { label, className } = config[status];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
