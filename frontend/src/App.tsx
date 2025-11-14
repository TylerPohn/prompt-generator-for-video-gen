import {
  PromptInputPanel,
  CardGrid,
  SectionHeader,
  FilterControls,
  ActiveFilters,
} from './components';
import { useVideoCards, useFilters } from './hooks';

function App() {
  const { cards, toggleFavorite, addLabel, removeLabel, updateCard, deleteCard } = useVideoCards();

  // Initialize filters
  const {
    filteredCards,
    filters,
    availableLabels,
    toggleFavoritesFilter,
    setLabelFilter,
    clearFilters,
    hasActiveFilters,
  } = useFilters(cards);

  const handleThumbnailGenerated = (id: string, thumbnailUrl: string) => {
    updateCard(id, { thumbnailUrl });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Video Prompt Lab
          </h1>
          <p className="mt-2 text-gray-600">
            Experiment with video generation models
          </p>
        </header>

        <div className="mb-8">
          <PromptInputPanel />
        </div>

        <div className="mt-12">
          <SectionHeader
            title="Generated Videos"
            count={filteredCards.length}
          >
            <FilterControls
              filters={filters}
              availableLabels={availableLabels}
              onToggleFavorites={toggleFavoritesFilter}
              onSelectLabel={setLabelFilter}
              onClearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </SectionHeader>

          <ActiveFilters
            filters={filters}
            onRemoveFavoriteFilter={toggleFavoritesFilter}
            onRemoveLabelFilter={() => setLabelFilter(null)}
          />

          <CardGrid
            cards={filteredCards}
            onToggleFavorite={toggleFavorite}
            onAddLabel={addLabel}
            onRemoveLabel={removeLabel}
            onThumbnailGenerated={handleThumbnailGenerated}
            onCardUpdate={updateCard}
            onDelete={deleteCard}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
