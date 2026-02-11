export function renderRecords(records, container) {
  if (!records.length) {
    container.innerHTML = "<p>No records found.</p>";
    return;
  }

  container.innerHTML = records
    .map((record) => {
      const school = record.school_name || record.school || record.school_id || "N/A";
      const team = record.team || "N/A";
      const division = record.division || "N/A";
      const gender = record.gender || "N/A";
      const deaflympics =
        record.deaflympics === true ? "Yes" : record.deaflympics === false ? "No" : "N/A";

      return `
        <article class="record">
          <h3>${record.name ?? "Unknown"}</h3>
          <p><strong>School:</strong> ${school}</p>
          <p><strong>Team:</strong> ${team}</p>
          <p><strong>Sport:</strong> ${record.sport ?? "N/A"}</p>
          <p><strong>Division:</strong> ${division}</p>
          <p><strong>Girls/Boys:</strong> ${gender}</p>
          <p><strong>Deaflympics:</strong> ${deaflympics}</p>
          <p><strong>Year:</strong> ${record.year ?? "N/A"}</p>
          <p><strong>Location:</strong> ${record.location ?? "N/A"}</p>
        </article>
      `;
    })
    .join("");
}
