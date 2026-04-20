import styles from "../error-pages.module.css";

export default function SuspendedPage() {
  return (
    <div className={styles.container}>
      <div className={`${styles.card} ${styles.danger}`}>
        <div className={styles.icon}>⛔️</div>
        <h1 className={styles.title}>Account Suspended</h1>
        <p className={styles.message}>
          This workspace has been temporarily suspended. Please contact your billing department or platform support to restore access.
        </p>
      </div>
    </div>
  );
}
