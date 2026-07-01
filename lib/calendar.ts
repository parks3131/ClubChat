import { supabase } from "./supabase";
import type { CalendarEventType } from "../types/database";

export interface DisplayCalendarEvent {
  id: string;
  clubId: string;
  eventType: CalendarEventType;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string | null;
  createdBy: string;
  createdByName: string;
}

async function attachCreatorNames(
  events: {
    id: string;
    club_id: string;
    event_type: CalendarEventType;
    title: string;
    description: string | null;
    location: string | null;
    start_at: string;
    end_at: string | null;
    created_by: string;
  }[]
): Promise<DisplayCalendarEvent[]> {
  if (events.length === 0) return [];

  const creatorIds = [...new Set(events.map((e) => e.created_by))];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", creatorIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return events.map((e) => ({
    id: e.id,
    clubId: e.club_id,
    eventType: e.event_type,
    title: e.title,
    description: e.description,
    location: e.location,
    startAt: e.start_at,
    endAt: e.end_at,
    createdBy: e.created_by,
    createdByName: nameById.get(e.created_by) ?? "Unknown",
  }));
}

export async function fetchEvents(clubId: string): Promise<DisplayCalendarEvent[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, club_id, event_type, title, description, location, start_at, end_at, created_by")
    .eq("club_id", clubId)
    .order("start_at", { ascending: true });

  if (error) throw error;
  return attachCreatorNames(data ?? []);
}

export async function fetchEvent(eventId: string): Promise<DisplayCalendarEvent | null> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, club_id, event_type, title, description, location, start_at, end_at, created_by")
    .eq("id", eventId)
    .single();

  if (error) throw error;
  if (!data) return null;
  const [event] = await attachCreatorNames([data]);
  return event;
}

export async function createEvent(params: {
  clubId: string;
  eventType: CalendarEventType;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string | null;
  createdBy: string;
}) {
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      club_id: params.clubId,
      event_type: params.eventType,
      title: params.title,
      description: params.description || null,
      location: params.location || null,
      start_at: params.startAt,
      end_at: params.endAt,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateEvent(
  eventId: string,
  params: {
    eventType: CalendarEventType;
    title: string;
    description: string;
    location: string;
    startAt: string;
    endAt: string | null;
  }
) {
  const { error } = await supabase
    .from("calendar_events")
    .update({
      event_type: params.eventType,
      title: params.title,
      description: params.description || null,
      location: params.location || null,
      start_at: params.startAt,
      end_at: params.endAt,
    })
    .eq("id", eventId);

  if (error) throw error;
}

export async function deleteEvent(eventId: string) {
  const { error } = await supabase.from("calendar_events").delete().eq("id", eventId);
  if (error) throw error;
}
