function ProgressBar({ value }) {
  return (
    <div className="progress-track" role="progressbar" aria-valuenow={value}>
      <div className="progress-fill" style={{ width: `${value}%` }} />
    </div>
  );
}

export default ProgressBar;
