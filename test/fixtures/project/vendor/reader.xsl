<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:shelf="urn:shelf" version="2.0">
  <xsl:template match="reader">
    <xsl:if test="'false'">
      <xsl:value-of select="concat(shelf:greeting(), child::name)"/>
    </xsl:if>
  </xsl:template>
</xsl:stylesheet>
