<template>
    <div>
        <div v-if="allowSelection && selectedCells.length === 2">
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
                                {{ cell.length === 0 ? 'NULL' : cell }}
                            </label>
                        </div>
                        <div v-else>
                            {{ cell.length === 0 ? 'NULL' : cell }}
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
            var formatted = []
            for (let i = 0; i < this.selectedCells.length; i++)
                formatted.push(this.selectedCells[i].split('-').map(i => Number(i)))
            return formatted;
        },
        getSelectedContent() {
            var content = []
            for (const indices of this.formatSelectedCells())
                content.push(this.table[indices[0]][indices[1]])
            return content
        },
        swap() {
            this.$emit('swap', this.formatSelectedCells())
            this.selectedCells = [];
        }
    }
}

</script>

<style>

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