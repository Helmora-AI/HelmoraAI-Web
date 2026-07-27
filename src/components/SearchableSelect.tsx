import {
  Typeahead,
  TypeaheadItem,
  type SearchableItem,
} from "@astryxdesign/core/Typeahead";
import { useMemo } from "react";
import {
  findSearchItem,
  toSearchSource,
  type HelmoraSearchItem,
} from "../lib/searchableSelect";

export interface SearchableSelectProps {
  label: string;
  items: HelmoraSearchItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  isOptional?: boolean;
  disabledMessage?: string;
  emptySearchResultsText?: string;
  hasClear?: boolean;
  maxMenuItems?: number;
  description?: string;
}

/**
 * Closed-set searchable selector. Keeps the canonical string ID in parent state.
 * Local/static sources use zero debounce and show entries on focus.
 */
export function SearchableSelect({
  label,
  items,
  value,
  onChange,
  placeholder = "Search…",
  isDisabled = false,
  isRequired = false,
  isOptional = false,
  disabledMessage,
  emptySearchResultsText = "No matches",
  hasClear = true,
  maxMenuItems = 50,
  description,
}: SearchableSelectProps) {
  const source = useMemo(() => toSearchSource(items), [items]);
  const selected = useMemo(() => findSearchItem(items, value), [items, value]);

  return (
    <div className="helmora-searchable-select">
      <Typeahead
        label={label}
        searchSource={source}
        value={selected}
        onChange={(item) => { onChange(item?.id ?? ""); }}
        placeholder={placeholder}
        hasEntriesOnFocus
        debounceMs={0}
        emptySearchResultsText={emptySearchResultsText}
        isDisabled={isDisabled}
        {...(disabledMessage ? { disabledMessage } : {})}
        isRequired={isRequired}
        isOptional={isOptional}
        hasClear={hasClear}
        maxMenuItems={maxMenuItems}
        width="100%"
        {...(description ? { description } : {})}
        renderItem={(item) => <SearchableSelectItem item={item} />}
      />
    </div>
  );
}

function SearchableSelectItem({ item }: { item: SearchableItem }) {
  const keywords = (item as HelmoraSearchItem).auxiliaryData?.keywords ?? [];
  const secondary = keywords.find((keyword) => keyword && keyword !== item.label) ?? item.id;
  return <TypeaheadItem item={item} {...(secondary && secondary !== item.label ? { description: secondary } : {})} />;
}
