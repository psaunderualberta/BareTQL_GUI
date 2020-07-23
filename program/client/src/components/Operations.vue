<template>
  <div>
    <div class="separate-components centering">
      <Logo />
      <Instruction ref="instruction-1" index="1">
        <template #hidden>
          <p>
            This the second part of the BareTQL application, where set expansion occurs. Here, we take the seed set you chose
            in the previous section and find different rows in the database that match the seed set, based on parameters that you have set.
          </p>
        </template>
      </Instruction>
      <button @click="showInstructions" style="margin-bottom:1%;">Learn about Part 2 of BareTQL</button>
      <br />

      <button @click="goBack">Return to Keyword Search</button>
    </div>
    <div class="separate-components centering">
      <h3>Seed Set: {{ table['rows'].length }} row{{ table['rows'].length - 1 ? 's' : '' }}, {{ numCols }} columns, {{ nullCount }} null values</h3>

      <div v-if="deletions.length > 0">
        <button
          v-on:submit.prevent
          type="submit"
          @click="deleteCols"
        >Click to delete columns {{ deletions }}</button>
      </div>

      <!-- Deletion buttons, Sliders -->
      <Instruction ref="instruction-3" index="3">
        <template #hidden>
          <p>
            These are where you can adjust the settings of your seed set. In particular, the slider above each column determines
            how similar you want the expanded rows to be for that column. 100% means only choose values that are currently in the column,
            0% means we can choose any values, and anything in between is a proportion of each.
          </p>
        </template>
      </Instruction>
      <Instruction ref="instruction-4" index="4">
        <template #hidden>
          <p>
            You can also delete a column by clicking on the 'delete column' button above each one.
            <br />You can delete more than one column at the same time, as you will be prompted before the deletion will occur.
          </p>
        </template>
      </Instruction>
      <table>
        <tbody>
          <tr>
            <td v-for="col in numCols" :key="col">
              <div style="text-align: left;">
                <span>
                  <input type="checkbox" :id="'unique'+col" :value="col" v-model="uniqueCols" />
                  <label :for="'unique'+col" style="padding: 0.5%;">Unique</label>
                </span>
                <span style="float: right;">
                  <input type="checkbox" :id="'delete'+col" :value="col" v-model="deletions" />
                  <label :for="'delete'+col" style="padding-right: 1%">X</label>
                </span>
              </div>
              <div style="float: none;">
                <p class="slider-values">{{ stickiness(sliderValues[col - 1]) }}% Sticky</p>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value=" "
                  class="slider"
                  v-model="sliderValues[col - 1]"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <Instruction ref="instruction-2" index="2">
        <template #hidden>
          <p>
            These are the values of your seed set. If you want to swap values, simply click on the values
            you want to swap and a button will appear that will allow you to swap.
          </p>
        </template>
      </Instruction>
      <UserTable :table="table" :allowSelection="true" @swap="swapCells" />

      <Instruction ref="instruction-5" index="5">
        <template #hidden>
          <p>
            These are the operations with which you can expand your seed set.
            <br />XR adds more rows, XC adds more columns, and Fill fills any null values you may have.
          </p>
        </template>
      </Instruction>
      <ButtonList :arr="functions" origin="Operations" @NewClick="executeDotOp" />
      <button
        id="dot-op-submit"
        v-if="dotOp.length !== 0"
        @click="executeDotOp"
        v-on:submit.prevent
      >Confirm Selection</button>
    </div>

    <!-- Result of Set Expansion -->
    <div class="separate-components centering">
      <Instruction ref="instruction-6" index="6">
        <template #shown>
          <h2>Result of Set Expansion</h2>
        </template>

        <template #hidden>
          <p>Here are the expanded rows of your seed set.</p>
        </template>
      </Instruction>
      <hr style="width: 80%;" />
      <h3
        v-if="!bootUp "
      >Expanded Rows: {{ expandedRows['rows'].length }} rows found</h3>
      <h4 v-else>No operation selected</h4>
      <UserTable :table="expandedRows" :downloadable="true" :hoverEffect="true" />
    </div>
  </div>
</template>

<script>
import Logo from "./Logo.vue";
import ButtonList from "./ButtonList.vue";
import UserTable from "./UserTable.vue";
import ResultService from "../getResults";
import Instruction from "./Instruction.vue";

export default {
  name: "Operations",
  components: {
    Logo,
    ButtonList,
    UserTable,
    Instruction
  },

  data: function() {
    return {
      functions: [{ message: "Expand Rows (XR)", value: "XR" }],
      expandedRows: { rows: [], info: [] },
      document: document,
      table: {rows: []},
      sliderValues: [],
      uniqueCols: [],
      deletions: [],
      bootUp: true,
      nullCount: 0,
      numCols: 0,
      dotOp: ""
    };
  },

  methods: {
    async showInstructions() {
      /* Shows the 'slideshow' of Instruction components */
      var inputButtons = this.document.querySelectorAll(
        "button:not(.instruction-button), input, labels"
      );
      for (let inp of Object.values(inputButtons)) {
        inp.disabled = true;
        inp.classList.toggle("deactivate");
      }

      for (
        let i = 1;
        i < document.querySelectorAll(".instruction-component").length + 1;
        i++
      ) {
        await this.$refs[`instruction-${i}`].handleClick();
      }

      for (let inp of Object.values(inputButtons)) {
        inp.disabled = false;
        inp.classList.toggle("deactivate");
      }
    },

    executeDotOp(op) {
      /* Executes the dot op selected by user */
      var changeButtons = function(buttons, content) {
        for (let key in Object.keys(buttons)) {
          buttons[key].textContent = content;
          buttons[key].disabled = !buttons[key].disabled;
          buttons[key].classList.toggle("deactivate");
        }
      };

      var submitButtons = this.document.querySelectorAll(".Operations");
      changeButtons(submitButtons, "Loading Results...");

      ResultService.handleDotOps(op, this.sliderValues, this.uniqueCols)
        .then(data => {
          changeButtons(submitButtons, "Click to perform operation");
          this.bootUp = false;
          this.expandedRows = this.handleResponse(data);
        })
        .catch(err => {
          changeButtons(submitButtons, "An error occurred. Please try again");
          console.log(err);
        });
    },

    deleteCols() {
      /* Deletes all columns that the user has selected */
      ResultService.deleteCols(this.deletions)
        .then(data => {
          this.table = this.handleResponse(data, true);
          this.deletions = [];
        })
        .catch(err => {
          console.log(err);
        });
    },

    handleResponse(data, seedSet = false) {
      /* handles the response from the API when receiving a modified seed set */
      var cellCount = 0;
      var tmp = { rows: [], info: [] };
      this.numCols = 0;
      this.sliderValues = [];

      if (typeof data["sliders"] !== "undefined") {
        for (let i = 0; i < data["sliders"].length; i++) {
          this.sliderValues.push(Number(data["sliders"][i]));
        }

        if (typeof data["info"] !== "undefined") tmp["info"] = data["info"];

        if (data["rows"].length > 0 && data["rows"][0].length > 0) {
          data["rows"].forEach(row => {
            row = row.split(" || ");
            cellCount += row.filter(cell => cell !== "NULL").length;
            this.numCols = Math.max(this.numCols, row.length);
            tmp["rows"].push(row);
          });
        }

        if (seedSet)
          this.nullCount = tmp["rows"].length * this.numCols - cellCount;
      }

      return tmp;
    },

    swapCells(indices) {
      /* Swaps the two cells selected by the user */
      ResultService.swapCells(indices)
        .then(data => {
          this.table = this.handleResponse(data, true);
        })
        .catch(err => {
          console.log(err);
        });
    },

    goBack() {
      /* Emits a function to change the screen back to keyword search */
      this.$emit("ChangeMode");
    },

    stickiness(stickyValue) {
      /* Determine 'stickiness' value to be displayed */
      if (typeof stickyValue === "undefined") {
        return 50;
      }
      return stickyValue;
    }
  },

  created() {
    /* Initial call to get the Seed Set from the API */
    ResultService.handleDotOps(undefined, this.sliderValues, this.uniqueCols)
      .then(data => {
        this.table = this.handleResponse(data, true);
      })
      .catch(err => {
        console.log(err);
      });
  },

  updated() {
    /* Adjusts number of columns when table is updated */
    this.table["rows"].forEach(row => {
      this.numCols = Math.max(row.length, this.numCols);
    });
  }
};
</script>


<style scoped>
.compress {
  width: 50%;
  justify-content: center;
}

/* https://www.w3schools.com/howto/howto_js_rangeslider.asp */
/* The slider itself */
.slider {
  -webkit-appearance: none; /* Override default CSS styles */
  appearance: none;
  width: 100%; /* Full-width */
  height: 40%; /* Specified height */
  background: #d3d3d3; /* Grey background */
  outline: none; /* Remove outline */
  opacity: 0.7; /* Set transparency (for mouse-over effects on hover) */
  -webkit-transition: 0.2s; /* 0.2 seconds transition on hover */
  transition: opacity 0.2s;
}

/* Mouse-over effects */
.slider:hover {
  opacity: 1; /* Fully shown on mouse-over */
}

/* The slider handle (use -webkit- (Chrome, Opera, Safari, Edge) and -moz- (Firefox) to override default look) */
.slider::-webkit-slider-thumb {
  -webkit-appearance: none; /* Override default look */
  appearance: none;
  width: 10%; /* Set a specific slider handle width */
  height: 100%; /* Slider handle height */
  background: #4caf50; /* Green background */
  cursor: pointer; /* Cursor on hover */
}

.slider::-moz-range-thumb {
  width: 10%; /* Set a specific slider handle width */
  height: 100%; /* Slider handle height */
  background: #4caf50; /* Green background */
  cursor: pointer; /* Cursor on hover */
}
</style>