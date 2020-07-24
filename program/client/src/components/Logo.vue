<template>
    <Overtop>
        <template #logo>
            <h1>BareTQL</h1>
        </template>

        <template #activator>
            Click me!
        </template>

        <template #header>
          <h2>Help Page</h2>
        </template>

        <template #content>
            <p>
                Welcome to BareTQL! BareTQL is a tool which provides the ability to 
                search through a data lake that the user provides in order to find similar
                rows to those deemed as 'interesting'. There are two main components to BareTQL: 
                <ul>
                    <li>
                        Keyword Search, where the user selects the rows they find 'interesting' through the use of a search bar.
                    </li>
                    <li>
                        Set Expansion, where BareTQL will find and return rows in the data lake which are identified to be the most similar.
                        You can then adjust the settings for the set expansion, from setting the importance of different columns to defining unique columns or deleting them.
                    </li>
                </ul>
            </p>
        </template>
    </Overtop>
</template>


<script>
import Overtop from './Overtop.vue'

export default {
    name: 'logo',
    components: {
        Overtop,
    }
}
</script>


<style scoped>

</style>