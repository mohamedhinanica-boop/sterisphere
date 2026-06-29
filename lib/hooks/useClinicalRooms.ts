"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ClinicalRoom = {
  id: string;
  label: string;
};

export type ClinicalRoomsState = "loading" | "ready" | "fallback";

type ClinicalWorkstationRow = {
  id: string;
  name: string;
  location_label: string | null;
};

export function useClinicalRooms() {
  const [rooms, setRooms] = useState<ClinicalRoom[]>([]);
  const [state, setState] = useState<ClinicalRoomsState>("loading");

  useEffect(() => {
    let isCurrent = true;

    async function loadRooms() {
      const { data, error } = await supabase
        .from("clinical_workstations")
        .select("id, name, location_label, display_order")
        .eq("status", "active")
        .eq("workstation_type", "operatory")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

      if (!isCurrent) {
        return;
      }

      if (error) {
        console.warn(
          "Configured clinical rooms are unavailable; enabling manual entry.",
          error,
        );
        setRooms([]);
        setState("fallback");
        return;
      }

      setRooms(
        ((data || []) as ClinicalWorkstationRow[]).map((workstation) => ({
          id: workstation.id,
          label: formatClinicalRoomLabel(workstation),
        })),
      );
      setState("ready");
    }

    loadRooms();

    return () => {
      isCurrent = false;
    };
  }, []);

  return { rooms, state };
}

function formatClinicalRoomLabel(workstation: ClinicalWorkstationRow) {
  const location = workstation.location_label?.trim();

  if (!location || location.toLocaleLowerCase() === workstation.name.toLocaleLowerCase()) {
    return workstation.name;
  }

  return `${workstation.name} · ${location}`;
}
