import { useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Block, text } from "../../shared/model";

export type DragHandle = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref: (element: HTMLButtonElement | null) => void;
};
function SortablePoint({
  block,
  enabled,
  children,
}: {
  block: Block;
  enabled: boolean;
  children: (handle?: DragHandle) => ReactNode;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, disabled: !enabled });
  return (
    <div
      ref={setNodeRef}
      id={`point-${block.id}`}
      data-block-id={block.id}
      className={`point-container sortable-point ${isDragging ? "is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children(
        enabled
          ? { ...attributes, ...listeners, ref: setActivatorNodeRef }
          : undefined,
      )}
    </div>
  );
}
export function SortableBlocks({
  blocks,
  enabled,
  onMove,
  onError,
  children,
}: {
  blocks: Block[];
  enabled: boolean;
  onMove: (id: string, overId: string) => Promise<void>;
  onError: (message: string) => void;
  children: (block: Block, handle?: DragHandle) => ReactNode;
}) {
  const [dragged, setDragged] = useState<{
    block: Block;
    height: number;
    offset: { x: number; y: number };
  } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: "auto",
    }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Druk op spatie om het punt op te pakken. Gebruik de pijltjestoetsen om het te verplaatsen, spatie om neer te zetten en Escape om te annuleren.",
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Punt opgepakt: ${text(blocks.find((b) => b.id === active.id)?.html ?? "")}`,
          onDragOver: ({ over }) =>
            over
              ? `Nieuwe plek: ${blocks.findIndex((b) => b.id === over.id) + 1} van ${blocks.length}.`
              : "",
          onDragEnd: () => "Punt neergezet.",
          onDragCancel: () => "Verplaatsen geannuleerd.",
        },
      }}
      onDragStart={({ active }) => {
        const block = blocks.find((b) => b.id === active.id);
        if (block) {
          const rect = document
            .getElementById(`point-${block.id}`)
            ?.getBoundingClientRect();
          const initial = active.rect.current.initial;
          setDragged({
            block,
            height: rect?.height ?? initial?.height ?? 54,
            offset: {
              x: (rect?.left ?? 0) - (initial?.left ?? rect?.left ?? 0),
              y: (rect?.top ?? 0) - (initial?.top ?? rect?.top ?? 0),
            },
          });
        }
      }}
      onDragCancel={() => setDragged(null)}
      onDragEnd={async ({ active, over }) => {
        try {
          if (over && over.id !== active.id)
            await onMove(String(active.id), String(over.id));
        } catch (error) {
          onError((error as Error).message);
        } finally {
          setDragged(null);
        }
      }}
    >
      <SortableContext
        items={blocks.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
      >
        {blocks.map((block) => (
          <SortablePoint key={block.id} block={block} enabled={enabled}>
            {(handle) => children(block, handle)}
          </SortablePoint>
        ))}
      </SortableContext>
      {createPortal(
        <DragOverlay
          dropAnimation={null}
          zIndex={90}
          modifiers={[
            // A handle can scroll into view before activation; the cached initial
            // rectangle may still use the old scroll position.
            ({ transform }) => ({
              ...transform,
              x: transform.x + (dragged?.offset.x ?? 0),
              y: transform.y + (dragged?.offset.y ?? 0),
            }),
          ]}
        >
          {dragged && (
            <div
              className={`drag-preview kind-${dragged.block.kind}`}
              style={{ height: dragged.height }}
            >
              <span aria-hidden="true">⠿</span>
              {dragged.block.kind === "task" && (
                <span className="checkbox">
                  {dragged.block.done ? "✓" : ""}
                </span>
              )}
              <span className="drag-preview-text">
                {text(dragged.block.html) || "Afbeelding of leeg punt"}
              </span>
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
