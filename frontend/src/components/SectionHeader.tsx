interface SectionHeaderProps {
  title: string;
  count?: number;
  children?: React.ReactNode;
}

export function SectionHeader({ title, count, children }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-lg font-normal text-gray-500">
              ({count})
            </span>
          )}
        </h2>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
