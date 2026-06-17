import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { formatCycleDuration } from "@/lib/modules/cycles";

export type Cycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  load_contents: string;
  status: string;
  cycle_state: string | null;
  expected_pack_count: number | null;
  duration_minutes: number | null;
  expected_finish_at: string | null;
  created_at: string;
};

export type Sterilizer = {
  id: string;
  name: string;
  type: string | null;
  active: boolean;
};

export type LoadItem = {
  packType: string;
  quantity: string;
};

export type SavedLoadItem = {
  id: string;
  cycle_id: string;
  pack_type: string;
  quantity: number;
};

export const packTypeOptions = [
  "Instrument Pouch",
  "Cassette",
  "Surgical Kit",
  "Hygiene Kit",
  "Exam Kit",
];

export function PageHeader() {
  return (
    <header className="mb-8">
      <h1 className="text-4xl font-bold">Sterilization Cycles</h1>
      <p className="mt-2 text-slate-600">
        Start sterilization cycles with load composition, duration tracking,
        and automatic pack generation when a cycle passes.
      </p>
    </header>
  );
}

type StartCycleFormProps = {
  form: {
    sterilizer: string;
    loadNotes: string;
    durationMinutes: string;
  };
  sterilizers: Sterilizer[];
  loadItems: LoadItem[];
  expectedPackCount: number;
  loading: boolean;
  updateForm: (field: string, value: string) => void;
  updateLoadItem: (index: number, field: keyof LoadItem, value: string) => void;
  addLoadItem: () => void;
  removeLoadItem: (index: number) => void;
  startCycle: () => void;
};

export function StartCycleForm({
  form,
  sterilizers,
  loadItems,
  expectedPackCount,
  loading,
  updateForm,
  updateLoadItem,
  addLoadItem,
  removeLoadItem,
  startCycle,
}: StartCycleFormProps) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-4xl mb-8">
      <h2 className="text-2xl font-semibold mb-2">Start Sterilization Cycle</h2>

      <p className="text-sm text-slate-600 mb-6">
        Add the load composition and duration before starting the cycle. The
        expected finish time will be calculated automatically.
      </p>

      <form className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Sterilizer</label>

          <select
            value={form.sterilizer}
            onChange={(e) => updateForm("sterilizer", e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="">
              {sterilizers.length === 0
                ? "No active sterilizers available"
                : "Select a sterilizer"}
            </option>

            {sterilizers.map((sterilizer) => (
              <option key={sterilizer.id} value={sterilizer.name}>
                {sterilizer.name}
                {sterilizer.type ? ` · ${sterilizer.type}` : ""}
              </option>
            ))}
          </select>

          <p className="mt-2 text-xs text-slate-500">
            Only active sterilizers are available for cycle creation.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Cycle Duration</label>

          <input
            type="number"
            min="1"
            value={form.durationMinutes}
            onChange={(e) => updateForm("durationMinutes", e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Example: 20"
          />

          <p className="mt-2 text-xs text-slate-500">
            Enter the duration programmed on the sterilizer. SteriSphere will
            calculate the expected finish time.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold">Load Composition</h3>
              <p className="text-sm text-slate-600 mt-1">
                Define what will be released as packs after this cycle.
              </p>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
              Expected packs: {expectedPackCount}
            </div>
          </div>

          <div className="space-y-3">
            {loadItems.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3"
              >
                <select
                  value={item.packType}
                  onChange={(e) => updateLoadItem(index, "packType", e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                >
                  {packTypeOptions.map((packType) => (
                    <option key={packType} value={packType}>
                      {packType}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateLoadItem(index, "quantity", e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                  placeholder="Qty"
                />

                <button
                  type="button"
                  onClick={() => removeLoadItem(index)}
                  disabled={loadItems.length === 1}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium cursor-pointer hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addLoadItem}
            className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium cursor-pointer hover:bg-slate-50"
          >
            Add Load Item
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Optional Load Notes</label>

          <textarea
            value={form.loadNotes}
            onChange={(e) => updateForm("loadNotes", e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 min-h-24"
            placeholder="Optional notes about this load..."
          />
        </div>

        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          This cycle will be created as <strong>Pending</strong> and <strong>Open</strong>. When marked as <strong>Passed</strong>, packs
          will be created automatically and the cycle will close.
        </div>

        <button
          type="button"
          onClick={startCycle}
          disabled={loading || sterilizers.length === 0}
          className="rounded-xl bg-slate-950 text-white px-6 py-3 min-h-11 font-medium cursor-pointer hover:bg-slate-800 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Starting..." : "Start Sterilization Cycle"}
        </button>
      </form>
    </section>
  );
}

type RunningCyclesSectionProps = {
  runningCycles: Cycle[];
  now: Date;
  loading: boolean;
  fetchCycles: () => void;
};

export function RunningCyclesSection({
  runningCycles,
  now,
  loading,
  fetchCycles,
}: RunningCyclesSectionProps) {
  if (runningCycles.length === 0) {
    return null;
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Running Cycles</h2>
          <p className="text-sm text-slate-600 mt-1">
            Live countdown based on the programmed duration and expected finish time.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchCycles}
          disabled={loading}
          className="rounded-xl border border-slate-300 px-4 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-slate-50 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {runningCycles.map((cycle) => {
          const timing = getCycleTiming(cycle, now);

          return (
            <div key={cycle.id} className={`rounded-xl border p-4 ${timing.containerClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{cycle.cycle_number}</h3>
                  <p className="text-sm text-slate-600 mt-1">{cycle.sterilizer}</p>
                </div>

                <span className={`rounded-lg border px-3 py-1 text-xs font-medium ${timing.badgeClass}`}>
                  {timing.label}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4 text-sm">
                <p className="text-slate-600">
                  Duration: <span className="font-medium text-slate-800">{cycle.duration_minutes ? `${cycle.duration_minutes} min` : "N/A"}</span>
                </p>

                <p className="text-slate-600">
                  Expected finish: <span className="font-medium text-slate-800">{formatDateTime(cycle.expected_finish_at)}</span>
                </p>
              </div>

              <p className={`mt-3 text-sm font-medium ${timing.textClass}`}>{timing.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type SavedCyclesSectionProps = {
  cycles: Cycle[];
  filteredCycles: Cycle[];
  paginatedCycles: Cycle[];
  statusFilter: string;
  stateFilter: string;
  searchTerm: string;
  currentPage: number;
  totalPages: number;
  loading: boolean;
  now: Date;
  setStatusFilter: (value: string) => void;
  setStateFilter: (value: string) => void;
  setSearchTerm: (value: string) => void;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  updateCycleStatus: (cycleId: string, newStatus: string) => void;
};

export function SavedCyclesSection({
  cycles,
  filteredCycles,
  paginatedCycles,
  statusFilter,
  stateFilter,
  searchTerm,
  currentPage,
  totalPages,
  loading,
  now,
  setStatusFilter,
  setStateFilter,
  setSearchTerm,
  setCurrentPage,
  updateCycleStatus,
}: SavedCyclesSectionProps) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-2xl font-semibold mb-4">Saved Cycles</h2>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="rounded-xl border border-slate-300 px-4 py-3"
        >
          <option value="All">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Passed">Passed</option>
          <option value="Failed">Failed</option>
        </select>

        <select
          value={stateFilter}
          onChange={(e) => {
            setStateFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="rounded-xl border border-slate-300 px-4 py-3"
        >
          <option value="All">All States</option>
          <option value="Open">Open</option>
          <option value="Closed">Closed</option>
        </select>

        <input
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="rounded-xl border border-slate-300 px-4 py-3"
          placeholder="Search cycles"
        />
      </div>

      {cycles.length === 0 ? (
        <p className="text-slate-500">No cycles saved yet.</p>
      ) : filteredCycles.length === 0 ? (
        <p className="text-slate-500">No matching cycles found.</p>
      ) : (
        <>
          <div className="space-y-3">
            {paginatedCycles.map((cycle) => (
              <CycleCard
                key={cycle.id}
                cycle={cycle}
                loading={loading}
                now={now}
                updateCycleStatus={updateCycleStatus}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 mt-6">
              <p className="text-sm text-slate-500">
                Page {currentPage} of {totalPages}
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => page - 1)}
                  className="rounded-xl border border-slate-300 px-4 py-2 min-h-11 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95 transition"
                >
                  Previous
                </button>

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((page) => page + 1)}
                  className="rounded-xl border border-slate-300 px-4 py-2 min-h-11 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95 transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

type CycleCardProps = {
  cycle: Cycle;
  loading: boolean;
  now: Date;
  updateCycleStatus: (cycleId: string, newStatus: string) => void;
};

function CycleCard({ cycle, loading, now, updateCycleStatus }: CycleCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-col md:flex-row md:justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <h3 className="font-semibold">{cycle.cycle_number}</h3>

            <div className="flex flex-wrap gap-2">
              <span className={`w-fit rounded-lg border px-3 py-1 text-xs font-medium ${getStatusBadgeClass(cycle.status)}`}>
                {cycle.status}
              </span>

              <span className={`w-fit rounded-lg border px-3 py-1 text-xs font-medium ${getStateBadgeClass(cycle.cycle_state || "Open")}`}>
                {cycle.cycle_state || "Open"}
              </span>
            </div>
          </div>

          <p className="text-sm text-slate-600 mt-1">
            {cycle.sterilizer} · Operator: {cycle.operator}
          </p>

          <p className="text-sm text-slate-500 mt-2">{cycle.load_contents}</p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3 text-sm text-slate-500">
            <p>
              Generated packs: <span className="font-medium text-slate-700">{cycle.expected_pack_count || "N/A"}</span>
            </p>

            <p>
              Duration: <span className="font-medium text-slate-700">{cycle.duration_minutes ? `${cycle.duration_minutes} min` : "N/A"}</span>
            </p>

            <p>
              Expected finish: <span className="font-medium text-slate-700">{formatDateTime(cycle.expected_finish_at)}</span>
            </p>

            <p>
              Time status: <span className={`font-medium ${getCycleTiming(cycle, now).textClass}`}>{getCycleTiming(cycle, now).label}</span>
            </p>
          </div>

          <p className="text-xs text-slate-400 mt-3">Created: {new Date(cycle.created_at).toLocaleString()}</p>

          {cycle.status === "Pending" && (
            <div className="flex flex-col md:flex-row gap-3 mt-4">
              <button
                type="button"
                disabled={loading}
                onClick={() => updateCycleStatus(cycle.id, "Passed")}
                className="rounded-xl bg-green-600 text-white px-4 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-green-700 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Mark as Passed + Generate Packs
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => updateCycleStatus(cycle.id, "Failed")}
                className="rounded-xl bg-red-600 text-white px-4 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-red-700 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Mark as Failed
              </button>
            </div>
          )}

          {cycle.status === "Failed" && (
            <Link
              href={`/investigation?cycle=${cycle.cycle_number}`}
              className="inline-block mt-4 rounded-xl bg-red-600 text-white px-4 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-red-700 active:scale-95 transition"
            >
              Investigate Failed Cycle
            </Link>
          )}
        </div>

        <div className="shrink-0">
          <QRCodeSVG value={cycle.cycle_number} size={90} />
        </div>
      </div>
    </div>
  );
}

export function getCycleTiming(cycle: Cycle, now: Date) {
  if (cycle.status !== "Pending" || (cycle.cycle_state || "Open") !== "Open") {
    return {
      label: "Closed",
      description: "This cycle is closed.",
      textClass: "text-slate-600",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      containerClass: "border-slate-200 bg-white",
    };
  }

  if (!cycle.expected_finish_at) {
    return {
      label: "No finish time",
      description: "No expected finish time is recorded for this cycle.",
      textClass: "text-slate-600",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      containerClass: "border-slate-200 bg-white",
    };
  }

  const finishTime = new Date(cycle.expected_finish_at).getTime();
  const currentTime = now.getTime();
  const diffMinutes = Math.ceil((finishTime - currentTime) / 60000);

  if (diffMinutes > 0) {
    const duration = formatCycleDuration(diffMinutes);

    return {
      label: `${duration} remaining`,
      description: `Expected to finish in ${duration}.`,
      textClass: "text-blue-700",
      badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
      containerClass: "border-blue-200 bg-blue-50",
    };
  }

  const overdueMinutes = Math.max(1, Math.abs(diffMinutes));
  const duration = formatCycleDuration(overdueMinutes);

  return {
    label: `Overdue by ${duration}`,
    description: `This cycle passed its expected finish time ${duration} ago.`,
    textClass: "text-red-700",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    containerClass: "border-red-200 bg-red-50",
  };
}

export function formatDateTime(date: string | null) {
  if (!date) {
    return "N/A";
  }

  return new Date(date).toLocaleString();
}

export function getStatusBadgeClass(status: string) {
  if (status === "Passed") {
    return "bg-green-100 text-green-700 border-green-200";
  }

  if (status === "Failed") {
    return "bg-red-100 text-red-700 border-red-200";
  }

  return "bg-yellow-100 text-yellow-700 border-yellow-200";
}

export function getStateBadgeClass(state: string) {
  if (state === "Closed") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }

  return "bg-blue-100 text-blue-700 border-blue-200";
}
