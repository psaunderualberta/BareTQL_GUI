<template>
  <div v-if="typeof table !== 'undefined'">
    <div v-if="allowSelection && selectedCells.length === 2">
      <!-- 'allowSelection' is unnecessary, but keeping for clarity -->
      <button v-on:submit.prevent @click="swap">Swap selected cells</button>
    </div>
    <div class="table" :id="'user-table-'+id">
      <div class="table-row tooltip" v-for="(row, row_index) in table['rows']" :key="row_index">
        <div class="table-cell" v-for="(cell, col_index) in row" :key="col_index">
          <div v-if="allowSelection">
            <input
              type="checkbox"
              :id="row_index+'-'+col_index"
              :value="row_index+'-'+col_index"
              v-model="selectedCells"
            />
            <label :for="row_index+'-'+col_index">{{ cell }}</label>
          </div>
          <div v-else>{{ cell }}</div>
          <span v-if="hoverEffect" v-html="table['info'][row_index]" class="tooltiptext"></span>
        </div>
      </div>
    </div>
    <button
      v-if="downloadable && table['rows'].length > 0"
      @click="exportTableToCSV('BareTQL.csv')"
    >Download as .csv</button>
  </div>
</template>

<script>
export default {
  name: "UserTable",
  props: {
    table: {
      type: Object,
      required: true,
    },
    allowSelection: {
      type: Boolean,
      required: false,
      default: false,
    },
    downloadable: {
      type: Boolean,
      required: false,
      default: false,
    },
    hoverEffect: {
      type: Boolean,
      required: false,
      default: false,
    },
  },

  data: function () {
    return {
      selectedCells: [],
      id: String(Math.random()),
    };
  },

  methods: {
    formatSelectedCells() {
      /* Formats the selected cells into an array of arrays of numbers */
      var formatted = [];
      for (let i = 0; i < this.selectedCells.length; i++)
        formatted.push(this.selectedCells[i].split("-").map((i) => Number(i)));
      return formatted;
    },

    getSelectedContent() {
      /* Gets the cell content from table based on
       * the return value of formatSelectedCells */
      var content = [];
      for (const indices of this.formatSelectedCells())
        content.push(this.table[indices[0]][indices[1]]);
      return content;
    },

    swap() {
      /* Tells parent to swap selected cells */
      this.$emit("swap", this.formatSelectedCells());
      this.selectedCells = []; // reset selected cells
    },

    /* Downloading a CSV file based on an HTML table
     * https://www.codexworld.com/export-html-table-data-to-csv-using-javascript/
     * Accessed July 20th, 2020 */

    downloadCSV(csv, filename) {
      /* Downloads the csv file */
      var csvFile;
      var downloadLink;

      // CSV file
      csvFile = new Blob([csv], { type: "text/csv" });

      // Download link
      downloadLink = document.createElement("a");

      // File name
      downloadLink.download = filename;

      // Create a link to the file
      downloadLink.href = window.URL.createObjectURL(csvFile);

      // Hide download link
      downloadLink.style.display = "none";

      // Add the link to DOM
      document.body.appendChild(downloadLink);

      // Click download link
      downloadLink.click();
    },

    exportTableToCSV(filename) {
      /* Downloads the csv file */
      var csv = [];
      var rows = document.querySelectorAll(
        `#user-table-${this.id.replace(".", "\\.")} div.table-row`
      );

      for (var i = 0; i < rows.length; i++) {
        var row = [],
          cols = rows[i].querySelectorAll("div.table-cell, div.table-header");

        for (var j = 0; j < cols.length; j++) row.push(cols[j].innerText);

        csv.push(row.join(","));
      }

      // Download CSV file
      this.downloadCSV(csv.join("\n"), filename);
    },

    /* End of code from https://www.codexworld.com/export-html-table-data-to-csv-using-javascript/ */
  },
};
</script>

<style scope>
table {
  margin: 0 auto;
  table-layout: fixed;
  width: 95%;
  padding-bottom: 3px;
}

td {
  border: 1px solid grey;
  padding: 2px;
  overflow: hidden;
}

.table {
  display: table;
  table-layout: fixed;
  margin: 0 auto;
  width: 95%;
  padding-bottom: 5px;
}
.table-row {
  display: table-row;
}
.table-cell {
  display: table-cell;
  border: 1px solid grey;
  padding: 2px;
  overflow: hidden;
  vertical-align: middle;
}

/* Allows the pop-ups with more information
 * https://www.w3schools.com/css/css_tooltip.asp 
 * Accessed July 20th 2020 */

/* Tooltip container */
.tooltip {
  position: relative;
}

/* Tooltip text */
.tooltip .tooltiptext {
  visibility: hidden;
  width: 20%;
  background-color: black;
  color: #fff;
  text-align: center;
  font-size: 0.8em;
  padding: 5px;
  border-radius: 6px;

  /* Position the tooltip text - see examples below! */
  position: absolute;
  z-index: 1;
  bottom: 0;
  left: 50%;
  margin-left: -10%; /* Use half of the width (120/2 = 60), to center the tooltip */
}

/* Show the tooltip text when you mouse over the tooltip container */
.tooltip:hover .tooltiptext {
  visibility: visible;
}
</style>