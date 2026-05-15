import {
  Activity,
  ClipboardCheck,
  FileText,
  PackageCheck,
  QrCode,
  ShieldCheck,
} from "lucide-react";

export default function Home() {
  return (
    <>
      <header className="mb-8">
        <p className="text-sm text-slate-500">Dentaria Internal System</p>
        <h2 className="text-4xl font-bold mt-1">Sterilization Dashboard</h2>
        <p className="text-slate-600 mt-2">
          Digital traceability for sterilization cycles, instrument packs, and
          patient-linked compliance records.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatCard icon={<ClipboardCheck />} title="Cycles Today" value="0" />
        <StatCard icon={<PackageCheck />} title="Packs Created" value="0" />
        <StatCard icon={<ShieldCheck />} title="Failed Cycles" value="0" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActionCard
          icon={<Activity />}
          title="Create Sterilization Cycle"
          description="Register a new autoclave cycle, operator, load details, and pass/fail status."
        />

        <ActionCard
          icon={<QrCode />}
          title="Generate QR Labels"
          description="Create unique QR codes for instrument pouches and cassette tracking."
        />

        <ActionCard
          icon={<PackageCheck />}
          title="Link Instruments to Patient"
          description="Scan a pouch QR code and connect it to a patient appointment."
        />

        <ActionCard
          icon={<FileText />}
          title="Export Audit Reports"
          description="Prepare clean compliance reports for internal review or inspection."
        />
      </div>
    </>
  );
}

function StatCard({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
      <div className="text-blue-600 mb-4">{icon}</div>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 hover:shadow-md transition">
      <div className="text-blue-600 mb-4">{icon}</div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="text-slate-600 mt-2">{description}</p>
      <button className="mt-5 rounded-xl bg-slate-950 text-white px-4 py-2 text-sm">
        Open
      </button>
    </div>
  );
}