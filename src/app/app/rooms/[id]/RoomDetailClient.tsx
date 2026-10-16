"use client";

import { t } from "@/lib/i18n";
import { useLocale } from "@/components/LocaleProvider";
import { useConfig } from "@/components/ConfigProvider";
import { LineBookingCta, PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { LoadingScreen } from "@/components/LoadingScreen";
import { RoomPoster } from "@/components/RoomPoster";

export default function RoomDetailClient({ roomId }: { roomId: string }) {
  const { locale } = useLocale();
  const { config, loading } = useConfig();
  const m = t(locale).rooms;
  const room = config.rooms.find((r) => r.id === roomId);

  if (loading) {
    return <LoadingScreen message={t(locale).common.loading} />;
  }

  if (!room) {
    return (
      <div className="px-4 pb-6 pt-5">
        <PageHeader eyebrow="Room" title={m.title} back="/app/rooms" backLabel={m.back} />
        <div className="rounded-petflow border border-petflow-line bg-card shadow-petflow-sm">
          <EmptyState icon="bed" title={locale === "th" ? "ไม่พบห้อง" : "Room not found"} />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 pt-5">
      <PageHeader
        eyebrow="Room"
        title={room.name}
        subtitle={`${room.price} ${m.perNight}`}
        back="/app/rooms"
        backLabel={m.back}
      />

      <RoomPoster src={room.image} alt={room.name} priority className="shadow-petflow-sm" />
      <p className="mt-2 text-center text-[11px] text-brown-faint">{m.posterHint}</p>

      <LineBookingCta locale={locale} />
    </div>
  );
}
