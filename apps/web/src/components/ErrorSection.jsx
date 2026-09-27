export const ErrorSection = ({ message, onRetry }) => {
  return (
    <div className="status-container">
      <div className="status-icon-wrapper">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>

      <h2>Processing Failed</h2>
      <p>{message || "Something went wrong during video processing. Please try again."}</p>

      <button
        type="button"
        className="btn btn-outline"
        onClick={onRetry}
        style={{ marginTop: "0.5rem" }}
      >
        Try Again
      </button>
    </div>
  );
};
