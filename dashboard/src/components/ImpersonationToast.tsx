export default function ImpersonationToast({ groupName }: { groupName: string }) {
  return (
    <div className="impersonation-toast" role="status" aria-live="polite">
      <div>
        <strong>Перегляд як: {groupName}</strong>
        <span>Це тільки тестовий режим для власника сервера. Реальні права акаунта не змінені.</span>
      </div>
      <form action="/api/admin/impersonation/end" method="post">
        <button className="btn subtle" type="submit">Завершити перегляд</button>
      </form>
    </div>
  );
}
