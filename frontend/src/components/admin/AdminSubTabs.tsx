import React from "react";

export interface AdminSubTab<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface AdminSubTabsProps<T extends string> {
  tabs: AdminSubTab<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}

export function AdminSubTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: AdminSubTabsProps<T>) {
  return (
    <div className="px-5 py-3 bg-white border-b border-brand-seashell/70">
      <nav
        className="inline-flex flex-wrap gap-1 p-1 bg-slate-100/80 rounded-xl border border-brand-seashell/60"
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer min-w-0 ${
                selected
                  ? "bg-white text-brand-cta shadow-sm border border-brand-seashell/80"
                  : "text-brand-pale hover:text-gray-700 hover:bg-white/60 border border-transparent"
              }`}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                    selected ? "bg-brand-cta/10 text-brand-cta" : "bg-white/70 text-brand-pale"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default AdminSubTabs;
