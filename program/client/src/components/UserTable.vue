<template>
    <div>
        <div v-if="allowSelection && selectedCells.length === 2"> <!-- 'allowSelection' is unnecessary, but keeping for clarity -->
            <button v-on:submit.prevent @click="swap">
                Swap cells "{{ getSelectedContent().join('", "') }}""?
            </button>
        </div>
        <table>
            <tbody>
                <tr v-for="(row, row_index) in table" :key="row_index">
                    <td v-for="(cell, col_index) in row" :key="col_index">
                        <div v-if="allowSelection">
                            <input type="checkbox" :id="row_index+'-'+col_index" :value="row_index+'-'+col_index" v-model="selectedCells">
                            <label :for="row_index+'-'+col_index">
                                {{ cell }}
                            </label>
                        </div>
                        <div v-else>
                            {{ cell }}
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script>
export default {
    name: 'UserTable',
    props: {
        table: Array,
        allowSelection: Boolean,
    },
    data: function() {
        return {
            selectedCells: []
        }
    },
    methods: {
        formatSelectedCells() {
            /* Formats the selected cells into an array of arrays of numbers */
            var formatted = []
            for (let i = 0; i < this.selectedCells.length; i++)
                formatted.push(this.selectedCells[i].split('-').map(i => Number(i)))
            return formatted;
        },
        getSelectedContent() {
            /* Gets the cell content from table based on 
             * the return value of formatSelectedCells */
            var content = []
            for (const indices of this.formatSelectedCells())
                content.push(this.table[indices[0]][indices[1]])
            return content
        },
        swap() {
            /* Tells parent to swap selected cells */
            this.$emit('swap', this.formatSelectedCells())
            this.selectedCells = []; // reset selected cells
        }
    }
}

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
}

</style>