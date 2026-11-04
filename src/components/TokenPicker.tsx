import React, { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { PayOption as PayOptionType } from "../mock/data.ts";
import { PayOption } from "./PayOption.tsx";

interface TokenPickerProps {
  options: PayOptionType[];
  selectedId?: string;
  onSelectOption: (option: PayOptionType) => void;
}

export function TokenPicker({ options, selectedId, onSelectOption }: TokenPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;

    return options.filter(
      (opt) =>
        opt.name.toLowerCase().includes(q) ||
        opt.symbol.toLowerCase().includes(q) ||
        opt.chain.toLowerCase().includes(q)
    );
  }, [options, searchQuery]);

  // Group by chain
  const groupedByChain = useMemo(() => {
    const map = new Map<string, PayOptionType[]>();
    for (const opt of filteredOptions) {
      const existing = map.get(opt.chain) || [];
      existing.push(opt);
      map.set(opt.chain, existing);
    }
    return Array.from(map.entries());
  }, [filteredOptions]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="pelargo-picker-search">
        <div className="pelargo-picker-search-icon" aria-hidden="true">
          <Search size={16} />
        </div>
        <input
          type="search"
          className="pelargo-picker-input"
          placeholder="Search by token or chain"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search payment options"
          autoFocus
        />
      </div>

      {groupedByChain.length === 0 ? (
        <div className="pelargo-empty-state">
          <div className="pelargo-empty-title">No matching tokens</div>
          <div className="pelargo-empty-desc">
            Try searching for another token name or chain
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {groupedByChain.map(([chain, chainOptions]) => (
            <div key={chain} className="pelargo-chain-group">
              <span className="pelargo-chain-group-label">{chain}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {chainOptions.map((opt) => (
                  <PayOption
                    key={opt.id}
                    option={opt}
                    isSelected={opt.id === selectedId}
                    onSelect={onSelectOption}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
