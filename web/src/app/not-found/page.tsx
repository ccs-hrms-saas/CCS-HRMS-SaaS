import styles from "../error-pages.module.css";

export default function NotFoundPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>🏢</div>
        <h1 className={styles.title}>Company Not Found</h1>
        <p className={styles.message}>
          We couldn't find a workspace at this address. Please check your URL or contact your HR administrator.
        </p>
      </div>
    </div>
  );
}
