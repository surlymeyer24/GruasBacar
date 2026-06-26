import React from "react";
import { Search, Filter, LucideIcon } from "lucide-react";
import { CustomSelect } from "../shared/CustomSelect";

export interface FilterOption {
  value: string;
  label: string;
}

interface AdminListFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  status: string;
  onStatusChange: (value: string) => void;
  statusOptions: FilterOption[];
  statusAriaLabel?: string;
  className?: string;
  extraFilter?: {
    value: string;
    onChange: (value: string) => void;
    options: FilterOption[];
    ariaLabel: string;
    icon?: LucideIcon;
  };
}

export const AdminListFilters: React.FC<AdminListFiltersProps> = ({
  search,
  onSearchChange,
  searchPlaceholder,
  status,
  onStatusChange,
  statusOptions,
  statusAriaLabel = "Filtrar por estado",
  className = "mb-4",
  extraFilter,
}) => {
  return (
    <div className={`flex flex-col sm:flex-row gap-2.5 ${className}`}>
      <div className="relative flex-1 min-w-0">
        <Search className="w-3.5 h-3.5 text-brand-pale absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-7 pr-3 py-2 bg-brand-bg border border-brand-seashell rounded-xl text-[13px] leading-tight text-brand-purply placeholder:text-brand-pale focus:outline-none focus:ring-2 focus:ring-brand-cta/25 focus:border-brand-cta/40 transition-shadow"
        />
      </div>

      <CustomSelect
        value={status}
        onChange={onStatusChange}
        options={statusOptions}
        ariaLabel={statusAriaLabel}
        icon={Filter}
        size="filter"
        className="w-full sm:w-52 shrink-0"
      />

      {extraFilter && (
        <CustomSelect
          value={extraFilter.value}
          onChange={extraFilter.onChange}
          options={extraFilter.options}
          ariaLabel={extraFilter.ariaLabel}
          icon={extraFilter.icon ?? Filter}
          size="filter"
          className="w-full sm:w-52 shrink-0"
        />
      )}
    </div>
  );
};

export default AdminListFilters;
